import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { createStudentSchema, linkParentSchema, updateStudentSchema } from '@schovexa/validation';
import type { CreateStudentInput, LinkParentInput, UpdateStudentInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { AuthorizationService } from '../authorization/authorization.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MAX_PAGE_SIZE, MAX_PHOTO_SIZE_BYTES, StudentsService, type StudentListFilters } from './students.service';
import type { AuthContext } from '../authorization/authorization.types';

const STUDENT_STATUSES = ['ENROLLED', 'TRANSFERRED', 'GRADUATED', 'WITHDRAWN'];
const SCHOOL_DAYS = ['FULL_DAY', 'FIRST_HALF', 'SECOND_HALF'];

// Query strings arrive as untrusted text: clamp numbers, cap the search
// length, and whitelist the status so nothing odd reaches Prisma.
function parseListQuery(query: Record<string, string | undefined>): StudentListFilters {
  const positiveInt = (value: string | undefined): number | undefined => {
    if (value === undefined || value === '') return undefined;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'page and pageSize must be positive whole numbers.' });
    }
    return n;
  };
  const text = (value: string | undefined) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
  const status = text(query.status);
  if (status && !STUDENT_STATUSES.includes(status)) {
    throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown status.' });
  }
  const schoolDay = text(query.schoolDay);
  if (schoolDay && !SCHOOL_DAYS.includes(schoolDay)) {
    throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown school day.' });
  }
  const pageSize = positiveInt(query.pageSize);
  const page = positiveInt(query.page) ?? (pageSize !== undefined ? 1 : undefined);
  return {
    sectionId: text(query.sectionId),
    classId: text(query.classId),
    classTeacherId: text(query.classTeacherId),
    status,
    schoolDay,
    search: text(query.search)?.slice(0, 80),
    page,
    pageSize: pageSize === undefined ? undefined : Math.min(pageSize, MAX_PAGE_SIZE),
  };
}

@Controller('students')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class StudentsController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Get()
  @RequirePermission('student.view')
  async list(@Query() query: Record<string, string | undefined>, @CurrentAuthContext() auth: AuthContext) {
    return this.studentsService.list(auth, parseListQuery(query));
  }

  @Post()
  @RequirePermission('student.create')
  async create(
    @Body(new ZodValidationPipe(createStudentSchema)) body: CreateStudentInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.studentsService.create(auth.schoolId, body);
  }

  @Get(':id')
  @RequirePermission('student.view')
  async findOne(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    await this.authorizationService.authorizeResource(auth, 'Student', id);
    return this.studentsService.findOne(auth.schoolId, id);
  }

  @Patch(':id')
  @RequirePermission('student.update')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateStudentSchema)) body: UpdateStudentInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    await this.authorizationService.authorizeResource(auth, 'Student', id);
    return this.studentsService.update(auth.schoolId, id, body);
  }

  @Delete(':id')
  @RequirePermission('student.delete')
  async remove(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    await this.authorizationService.authorizeResource(auth, 'Student', id);
    return this.studentsService.remove(auth.schoolId, id);
  }

  @Post(':id/parents')
  @RequirePermission('student.update')
  async linkParent(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(linkParentSchema)) body: LinkParentInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    await this.authorizationService.authorizeResource(auth, 'Student', id);
    return this.studentsService.linkParent(auth.schoolId, id, body);
  }

  @Delete(':id/parents/:parentId')
  @RequirePermission('student.update')
  async unlinkParent(
    @Param('id') id: string,
    @Param('parentId') parentId: string,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    await this.authorizationService.authorizeResource(auth, 'Student', id);
    return this.studentsService.unlinkParent(auth.schoolId, id, parentId);
  }

  @Post(':id/photo')
  @RequirePermission('student.update')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_PHOTO_SIZE_BYTES } }))
  async setPhoto(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @CurrentAuthContext() auth: AuthContext) {
    await this.authorizationService.authorizeResource(auth, 'Student', id);
    return this.studentsService.setPhoto(auth.schoolId, id, file);
  }

  @Delete(':id/photo')
  @RequirePermission('student.update')
  async removePhoto(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    await this.authorizationService.authorizeResource(auth, 'Student', id);
    return this.studentsService.removePhoto(auth.schoolId, id);
  }

  @Get(':id/photo')
  @RequirePermission('student.view')
  async photo(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    await this.authorizationService.authorizeResource(auth, 'Student', id);
    const { contentType, stream } = await this.studentsService.getPhoto(auth.schoolId, id);
    res.set({ 'Content-Type': contentType, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(stream);
  }
}
