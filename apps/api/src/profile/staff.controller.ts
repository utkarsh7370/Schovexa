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
import type { AuthContext } from '../authorization/authorization.types';
import { DocumentsService, MAX_DOCUMENT_SIZE_BYTES } from '../documents/documents.service';
import { ProfileService } from './profile.service';

// Another staff member's profile and their documents (ID proof,
// certificates). Personal data, so it is gated by the staff permissions —
// `user.view` to look, `user.update` to add or remove a document — and by
// the SchoolMembership scope check, which makes a membership from another
// school a plain 404.
@Controller('staff')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class StaffController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly documentsService: DocumentsService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Get(':membershipId')
  @RequirePermission('user.view')
  async profile(@Param('membershipId') membershipId: string, @CurrentAuthContext() auth: AuthContext) {
    await this.authorizationService.authorizeResource(auth, 'SchoolMembership', membershipId);
    return this.profileService.getStaff(auth.schoolId, membershipId);
  }

  @Get(':membershipId/documents')
  @RequirePermission('user.view')
  async documents(@Param('membershipId') membershipId: string, @CurrentAuthContext() auth: AuthContext) {
    await this.authorizationService.authorizeResource(auth, 'SchoolMembership', membershipId);
    const userId = await this.profileService.userIdForMembership(auth.schoolId, membershipId);
    return this.profileService.listDocuments(auth.schoolId, userId);
  }

  @Post(':membershipId/documents')
  @RequirePermission('user.update')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES } }))
  async upload(
    @Param('membershipId') membershipId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('category') category: string | undefined,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    await this.authorizationService.authorizeResource(auth, 'SchoolMembership', membershipId);
    const userId = await this.profileService.userIdForMembership(auth.schoolId, membershipId);
    return this.documentsService.upload(auth.schoolId, 'User', userId, auth.userId, file, category);
  }

  @Get(':membershipId/documents/:id/download')
  @RequirePermission('user.view')
  async download(
    @Param('membershipId') membershipId: string,
    @Param('id') id: string,
    @CurrentAuthContext() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    await this.authorizationService.authorizeResource(auth, 'SchoolMembership', membershipId);
    const userId = await this.profileService.userIdForMembership(auth.schoolId, membershipId);
    const owned = await this.profileService.findDocument(auth.schoolId, userId, id);
    const { document, stream } = await this.documentsService.getForDownload(auth.schoolId, owned.id);
    res.set({
      'Content-Type': document.mimeType,
      'Content-Disposition': `attachment; filename="${document.fileName.replace(/"/g, '')}"`,
    });
    return new StreamableFile(stream);
  }

  @Delete(':membershipId/documents/:id')
  @RequirePermission('user.update')
  async remove(
    @Param('membershipId') membershipId: string,
    @Param('id') id: string,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    await this.authorizationService.authorizeResource(auth, 'SchoolMembership', membershipId);
    const userId = await this.profileService.userIdForMembership(auth.schoolId, membershipId);
    const owned = await this.profileService.findDocument(auth.schoolId, userId, id);
    return this.documentsService.remove(auth.schoolId, owned.id);
  }
}
