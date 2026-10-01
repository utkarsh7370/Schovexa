import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { createNoticeSchema } from '@schovexa/validation';
import type { CreateNoticeInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { NoticesService } from './notices.service';
import type { AuthContext } from '../authorization/authorization.types';

@Controller()
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class NoticesController {
  constructor(private readonly noticesService: NoticesService) {}

  @Get('notices')
  @RequirePermission('notice.view')
  async list(@CurrentAuthContext() auth: AuthContext) {
    return this.noticesService.list(auth.schoolId, auth.userId, auth.roleId);
  }

  @Post('notices')
  @RequirePermission('notice.create')
  async create(
    @Body(new ZodValidationPipe(createNoticeSchema)) body: CreateNoticeInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.noticesService.create(auth.schoolId, auth.userId, body);
  }

  @Post('notices/:id/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('notice.publish')
  async publish(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    return this.noticesService.publish(auth.schoolId, id);
  }

  @Post('notices/:id/read')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('notice.view')
  async markRead(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    return this.noticesService.markRead(auth.schoolId, auth.userId, id);
  }
}
