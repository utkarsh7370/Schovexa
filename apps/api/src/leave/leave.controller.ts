import { Body, Controller, Get, Param, Post, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';
import { applyLeaveSchema, decideNoteSchema, rejectNoteSchema } from '@schovexa/validation';
import type { ApplyLeaveInput, DecideNoteInput, RejectNoteInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import type { AuthContext } from '../authorization/authorization.types';
import { parsePagination } from '../common/pagination.util';
import { requestMeta } from '../common/request-meta.util';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MAX_DOCUMENT_SIZE_BYTES } from '../documents/documents.service';
import { AttachmentsService } from '../teaching/attachments.service';
import { LEAVE_FILES, LeaveService } from './leave.service';

const text = (v: string | undefined) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : undefined);

@Controller('leave')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class LeaveController {
  constructor(
    private readonly leave: LeaveService,
    private readonly attachments: AttachmentsService,
  ) {}

  // -- Your own leave --------------------------------------------------------------------------
  @Get('mine')
  @RequirePermission('leave.apply')
  mine(@CurrentAuthContext() auth: AuthContext) {
    return this.leave.mine(auth);
  }

  @Post()
  @RequirePermission('leave.apply')
  apply(@Body(new ZodValidationPipe(applyLeaveSchema)) body: ApplyLeaveInput, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.leave.apply(auth, body, requestMeta(req));
  }

  @Post('mine/:id/cancel')
  @RequirePermission('leave.apply')
  cancel(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    return this.leave.cancel(auth, id);
  }

  @Post('mine/:id/files')
  @RequirePermission('leave.apply')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES } }))
  upload(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @CurrentAuthContext() auth: AuthContext) {
    return this.leave.uploadFile(auth, id, file);
  }

  @Get('mine/:id/files/:docId')
  @RequirePermission('leave.apply')
  async downloadMine(@Param('id') id: string, @Param('docId') docId: string, @CurrentAuthContext() auth: AuthContext, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    await this.leave.fileOwner(auth, id, true);
    return this.attachments.stream(auth.schoolId, LEAVE_FILES, id, docId, res);
  }

  // -- Everyone's leave (whoever decides) -------------------------------------------------------
  @Get()
  @RequirePermission('leave.view')
  list(@Query('status') status: string | undefined, @Query('search') search: string | undefined, @Query('page') page: string | undefined, @Query('pageSize') pageSize: string | undefined, @CurrentAuthContext() auth: AuthContext) {
    const { page: p, pageSize: ps } = parsePagination(page, pageSize);
    return this.leave.list(auth, { status: text(status), search: text(search) }, p, ps);
  }

  @Get(':id/files')
  @RequirePermission('leave.view')
  async files(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    await this.leave.fileOwner(auth, id, false);
    return this.leave.listFiles(auth, id);
  }

  @Get(':id/files/:docId')
  @RequirePermission('leave.view')
  async download(@Param('id') id: string, @Param('docId') docId: string, @CurrentAuthContext() auth: AuthContext, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    await this.leave.fileOwner(auth, id, false);
    return this.attachments.stream(auth.schoolId, LEAVE_FILES, id, docId, res);
  }

  @Post(':id/approve')
  @RequirePermission('leave.approve')
  approve(@Param('id') id: string, @Body(new ZodValidationPipe(decideNoteSchema)) body: DecideNoteInput, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.leave.decide(auth, id, true, body.note || undefined, requestMeta(req));
  }

  @Post(':id/reject')
  @RequirePermission('leave.approve')
  reject(@Param('id') id: string, @Body(new ZodValidationPipe(rejectNoteSchema)) body: RejectNoteInput, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.leave.decide(auth, id, false, body.note, requestMeta(req));
  }
}
