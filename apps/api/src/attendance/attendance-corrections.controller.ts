import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { decideNoteSchema, rejectNoteSchema, requestAttendanceCorrectionSchema } from '@schovexa/validation';
import type { DecideNoteInput, RejectNoteInput, RequestAttendanceCorrectionInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import type { AuthContext } from '../authorization/authorization.types';
import { parsePagination } from '../common/pagination.util';
import { requestMeta } from '../common/request-meta.util';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AttendanceCorrectionsService } from './attendance-corrections.service';

@Controller('attendance/corrections')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class AttendanceCorrectionsController {
  constructor(private readonly corrections: AttendanceCorrectionsService) {}

  @Get()
  @RequirePermission('attendance.view')
  list(@Query('status') status: string | undefined, @Query('page') page: string | undefined, @Query('pageSize') pageSize: string | undefined, @CurrentAuthContext() auth: AuthContext) {
    const { page: p, pageSize: ps } = parsePagination(page, pageSize);
    return this.corrections.list(auth, status, p, ps);
  }

  @Post()
  @RequirePermission('attendance.requestCorrection')
  request(@Body(new ZodValidationPipe(requestAttendanceCorrectionSchema)) body: RequestAttendanceCorrectionInput, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.corrections.request(auth, body, requestMeta(req));
  }

  @Post(':id/approve')
  @RequirePermission('attendance.approveCorrection')
  approve(@Param('id') id: string, @Body(new ZodValidationPipe(decideNoteSchema)) body: DecideNoteInput, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.corrections.approve(auth, id, body.note || undefined, requestMeta(req));
  }

  @Post(':id/reject')
  @RequirePermission('attendance.approveCorrection')
  reject(@Param('id') id: string, @Body(new ZodValidationPipe(rejectNoteSchema)) body: RejectNoteInput, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.corrections.reject(auth, id, body.note, requestMeta(req));
  }
}
