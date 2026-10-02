import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { AuthorizationService } from '../authorization/authorization.service';
import { DocumentsService, MAX_DOCUMENT_SIZE_BYTES } from './documents.service';
import type { AuthContext } from '../authorization/authorization.types';

// Documents are never served from a public/unauthenticated URL — every
// route here sits behind the same AuthGuard -> SchoolContextGuard ->
// PermissionGuard -> authorizeResource pipeline as any other resource
// (docs/architecture.md §8, docs/authorization.md).
@Controller()
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Get('students/:studentId/documents')
  @RequirePermission('document.view')
  async listForStudent(@Param('studentId') studentId: string, @CurrentAuthContext() auth: AuthContext) {
    await this.authorizationService.authorizeResource(auth, 'Student', studentId);
    return this.documentsService.listForOwner(auth.schoolId, 'Student', studentId);
  }

  @Post('students/:studentId/documents')
  @RequirePermission('document.upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES } }))
  async uploadForStudent(
    @Param('studentId') studentId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('category') category: string | undefined,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    await this.authorizationService.authorizeResource(auth, 'Student', studentId);
    return this.documentsService.upload(auth.schoolId, 'Student', studentId, auth.userId, file, category);
  }

  // What the school accepts (types, size, categories, required documents).
  @Get('documents/config')
  @RequirePermission('document.view')
  async config(@CurrentAuthContext() auth: AuthContext) {
    return this.documentsService.config(auth.schoolId);
  }

  @Get('documents/:id/download')
  @RequirePermission('document.view')
  async download(
    @Param('id') id: string,
    @CurrentAuthContext() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    await this.authorizationService.authorizeResource(auth, 'Document', id);
    const { document, stream } = await this.documentsService.getForDownload(auth.schoolId, id);
    res.set({
      'Content-Type': document.mimeType,
      'Content-Disposition': `attachment; filename="${document.fileName.replace(/"/g, '')}"`,
    });
    return new StreamableFile(stream);
  }

  @Delete('documents/:id')
  @RequirePermission('document.delete')
  async remove(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    await this.authorizationService.authorizeResource(auth, 'Document', id);
    return this.documentsService.remove(auth.schoolId, id);
  }
}
