import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { createContentSchema, updateContentSchema } from '@schovexa/validation';
import type { CreateContentInput, UpdateContentInput } from '@schovexa/validation';
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
import { CONTENT_FILES, ContentService } from './content.service';

const text = (v: string | undefined) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : undefined);

@Controller('content')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class ContentController {
  constructor(
    private readonly content: ContentService,
    private readonly attachments: AttachmentsService,
  ) {}

  @Get()
  @RequirePermission('content.view')
  list(
    @Query('sectionId') sectionId: string | undefined,
    @Query('subjectId') subjectId: string | undefined,
    @Query('kind') kind: string | undefined,
    @Query('status') status: string | undefined,
    @Query('search') search: string | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    const { page: p, pageSize: ps } = parsePagination(page, pageSize);
    return this.content.list(auth, { sectionId: text(sectionId), subjectId: text(subjectId), kind: text(kind), status: text(status), search: text(search) }, p, ps);
  }

  @Post()
  @RequirePermission('content.create')
  create(@Body(new ZodValidationPipe(createContentSchema)) body: CreateContentInput, @CurrentAuthContext() auth: AuthContext) {
    return this.content.create(auth, body);
  }

  @Get(':id')
  @RequirePermission('content.view')
  detail(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    return this.content.detail(auth, id);
  }

  @Patch(':id')
  @RequirePermission('content.create')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(updateContentSchema)) body: UpdateContentInput, @CurrentAuthContext() auth: AuthContext) {
    return this.content.update(auth, id, body);
  }

  @Post(':id/files')
  @RequirePermission('content.create')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES } }))
  upload(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @CurrentAuthContext() auth: AuthContext) {
    return this.content.uploadFile(auth, id, file);
  }

  @Get(':id/files/:docId')
  @RequirePermission('content.view')
  async download(@Param('id') id: string, @Param('docId') docId: string, @CurrentAuthContext() auth: AuthContext, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    await this.content.openFile(auth, id);
    return this.attachments.stream(auth.schoolId, CONTENT_FILES, id, docId, res);
  }

  @Delete(':id/files/:docId')
  @RequirePermission('content.create')
  removeFile(@Param('id') id: string, @Param('docId') docId: string, @CurrentAuthContext() auth: AuthContext) {
    return this.content.removeFile(auth, id, docId);
  }
}
