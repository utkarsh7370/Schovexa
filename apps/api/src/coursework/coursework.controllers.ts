import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import type { CourseworkKind } from '@prisma/client';
import { createCourseworkSchema, saveSubmissionsSchema, updateCourseworkSchema } from '@schovexa/validation';
import type { CreateCourseworkInput, SaveSubmissionsInput, UpdateCourseworkInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import type { AuthContext } from '../authorization/authorization.types';
import { parsePagination } from '../common/pagination.util';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MAX_DOCUMENT_SIZE_BYTES } from '../documents/documents.service';
import { AttachmentsService } from '../teaching/attachments.service';
import { COURSEWORK_FILES, CourseworkService, SUBMISSION_FILES } from './coursework.service';

const text = (v: string | undefined) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : undefined);
const upload = () => FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES } });

interface Permissions {
  /** See the list and the details. */
  view: string;
  /** Set, edit, cancel, attach files. */
  create: string;
  /** Record submissions, review, mark, comment. */
  review: string;
}

// Homework and assignments are the same machinery under two names and two sets of permissions, so one
// controller is built twice rather than written twice.
function buildController(kind: CourseworkKind, prefix: string, perms: Permissions) {
  @Controller(prefix)
  @UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
  class CourseworkController {
    constructor(
      readonly service: CourseworkService,
      readonly attachments: AttachmentsService,
    ) {}

    @Get()
    @RequirePermission(perms.view)
    list(
      @Query('sectionId') sectionId: string | undefined,
      @Query('subjectId') subjectId: string | undefined,
      @Query('status') status: string | undefined,
      @Query('when') when: string | undefined,
      @Query('search') search: string | undefined,
      @Query('page') page: string | undefined,
      @Query('pageSize') pageSize: string | undefined,
      @CurrentAuthContext() auth: AuthContext,
    ) {
      const { page: p, pageSize: ps } = parsePagination(page, pageSize);
      return this.service.list(auth, kind, { sectionId: text(sectionId), subjectId: text(subjectId), status: text(status), when: text(when), search: text(search) }, p, ps);
    }

    @Post()
    @RequirePermission(perms.create)
    create(@Body(new ZodValidationPipe(createCourseworkSchema)) body: CreateCourseworkInput, @CurrentAuthContext() auth: AuthContext) {
      return this.service.create(auth, kind, body);
    }

    @Get(':id')
    @RequirePermission(perms.view)
    detail(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
      return this.service.detail(auth, kind, id);
    }

    @Patch(':id')
    @RequirePermission(perms.create)
    update(@Param('id') id: string, @Body(new ZodValidationPipe(updateCourseworkSchema)) body: UpdateCourseworkInput, @CurrentAuthContext() auth: AuthContext) {
      return this.service.update(auth, kind, id, body);
    }

    // Who handed in, review, remarks, marks — saved for a whole class in one go.
    @Post(':id/submissions')
    @RequirePermission(perms.review)
    saveSubmissions(@Param('id') id: string, @Body(new ZodValidationPipe(saveSubmissionsSchema)) body: SaveSubmissionsInput, @CurrentAuthContext() auth: AuthContext) {
      return this.service.saveSubmissions(auth, kind, id, body);
    }

    @Get(':id/files')
    @RequirePermission(perms.view)
    files(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
      return this.service.listFiles(auth, kind, id);
    }

    @Post(':id/files')
    @RequirePermission(perms.create)
    @UseInterceptors(upload())
    uploadFile(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @CurrentAuthContext() auth: AuthContext) {
      return this.service.uploadFile(auth, kind, id, file);
    }

    @Get(':id/files/:docId')
    @RequirePermission(perms.view)
    async download(@Param('id') id: string, @Param('docId') docId: string, @CurrentAuthContext() auth: AuthContext, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
      await this.service.openFile(auth, kind, id);
      return this.attachments.stream(auth.schoolId, COURSEWORK_FILES, id, docId, res);
    }

    @Delete(':id/files/:docId')
    @RequirePermission(perms.create)
    removeFile(@Param('id') id: string, @Param('docId') docId: string, @CurrentAuthContext() auth: AuthContext) {
      return this.service.removeFile(auth, kind, id, docId);
    }

    // Files a student's work came in as (a scan, a photo) — attached to the student's submission.
    @Get(':id/students/:studentId/files')
    @RequirePermission(perms.review)
    submissionFiles(@Param('id') id: string, @Param('studentId') studentId: string, @CurrentAuthContext() auth: AuthContext) {
      return this.service.submissionFiles(auth, kind, id, studentId);
    }

    @Post(':id/students/:studentId/files')
    @RequirePermission(perms.review)
    @UseInterceptors(upload())
    uploadSubmissionFile(@Param('id') id: string, @Param('studentId') studentId: string, @UploadedFile() file: Express.Multer.File, @CurrentAuthContext() auth: AuthContext) {
      return this.service.uploadSubmissionFile(auth, kind, id, studentId, file);
    }

    @Get(':id/students/:studentId/files/:docId')
    @RequirePermission(perms.review)
    async downloadSubmissionFile(@Param('id') id: string, @Param('studentId') studentId: string, @Param('docId') docId: string, @CurrentAuthContext() auth: AuthContext, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
      const sub = await this.service.submissionFileOwner(auth, kind, id, studentId);
      return this.attachments.stream(auth.schoolId, SUBMISSION_FILES, sub.id, docId, res);
    }
  }
  return CourseworkController;
}

export const HomeworkController = buildController('HOMEWORK', 'homework', { view: 'homework.view', create: 'homework.create', review: 'homework.review' });
export const AssignmentsController = buildController('ASSIGNMENT', 'assignments', { view: 'assignment.view', create: 'assignment.create', review: 'assignment.evaluate' });
