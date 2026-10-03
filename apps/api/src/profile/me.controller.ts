import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';
import { updateProfileSchema } from '@schovexa/validation';
import type { UpdateProfileInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { MAX_PHOTO_SIZE_BYTES } from '../storage/photo-storage.service';
import type { AuthContext } from '../authorization/authorization.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { requestMeta } from '../common/request-meta.util';
import { DocumentsService, MAX_DOCUMENT_SIZE_BYTES } from '../documents/documents.service';
import { AuditService } from '../audit/audit.service';
import { ProfileService } from './profile.service';

// "My profile": every signed-in member of a school manages their OWN
// details here. There is no permission to grant or withhold — the route
// can only ever touch auth.userId, which comes from the verified session,
// never from the URL or body. (What an admin may see of OTHER people lives
// in StaffController, behind real permissions.)
@Controller('me')
@UseGuards(AuthGuard, SchoolContextGuard)
export class MeController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly documentsService: DocumentsService,
    private readonly audit: AuditService,
  ) {}

  @Get('profile')
  async profile(@CurrentAuthContext() auth: AuthContext) {
    return this.profileService.getOwn(auth.schoolId, auth.membershipId);
  }

  @Patch('profile')
  async update(
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
    @CurrentAuthContext() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.profileService.updateOwn(auth.schoolId, auth.membershipId, auth.userId, body, requestMeta(req));
  }

  // Own profile photo — JPEG/PNG up to 2 MB, checked by content, served only to the signed-in person.
  @Post('photo')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_PHOTO_SIZE_BYTES } }))
  async setPhoto(@UploadedFile() file: Express.Multer.File, @CurrentAuthContext() auth: AuthContext) {
    return this.profileService.setOwnPhoto(auth.userId, auth.schoolId, file);
  }

  @Get('photo')
  async photo(@CurrentAuthContext() auth: AuthContext, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const { contentType, stream } = await this.profileService.ownPhoto(auth.userId);
    res.set({ 'Content-Type': contentType, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(stream);
  }

  @Delete('photo')
  async removePhoto(@CurrentAuthContext() auth: AuthContext) {
    return this.profileService.removeOwnPhoto(auth.userId);
  }

  @Get('documents')
  async documents(@CurrentAuthContext() auth: AuthContext) {
    return this.profileService.listDocuments(auth.schoolId, auth.userId);
  }

  @Post('documents')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES } }))
  async upload(@UploadedFile() file: Express.Multer.File, @Body('category') category: string | undefined, @CurrentAuthContext() auth: AuthContext) {
    const document = await this.documentsService.upload(auth.schoolId, 'User', auth.userId, auth.userId, file, category);
    await this.audit.record({
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'profile.document_upload',
      module: 'profile',
      resourceType: 'Document',
      resourceId: document.id,
    });
    return document;
  }

  @Get('documents/:id/download')
  async download(
    @Param('id') id: string,
    @CurrentAuthContext() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const owned = await this.profileService.findDocument(auth.schoolId, auth.userId, id);
    const { document, stream } = await this.documentsService.getForDownload(auth.schoolId, owned.id);
    res.set({
      'Content-Type': document.mimeType,
      'Content-Disposition': `attachment; filename="${document.fileName.replace(/"/g, '')}"`,
    });
    return new StreamableFile(stream);
  }

  @Delete('documents/:id')
  async remove(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    const owned = await this.profileService.findDocument(auth.schoolId, auth.userId, id);
    return this.documentsService.remove(auth.schoolId, owned.id);
  }
}
