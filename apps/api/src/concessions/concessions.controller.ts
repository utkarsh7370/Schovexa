import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { createConcessionSchema, decideRefundSchema, rejectRefundSchema } from '@schovexa/validation';
import type { CreateConcessionInput, DecideRefundInput, RejectRefundInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { parsePagination } from '../common/pagination.util';
import { requestMeta } from '../common/request-meta.util';
import { ConcessionsService } from './concessions.service';
import type { AuthContext } from '../authorization/authorization.types';

// discount.request / discount.apply / discount.approve — separate permissions.
// Creating one needs request (or apply, for a small discount); the service then
// decides whether it is applied at once or has to wait for approval.
@Controller('concessions')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class ConcessionsController {
  constructor(private readonly concessions: ConcessionsService) {}

  @Get()
  @RequirePermission('discount.view')
  async list(
    @Query('status') status: string | undefined,
    @Query('kind') kind: string | undefined,
    @Query('search') search: string | undefined,
    @Query('studentId') studentId: string | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    const { page: p, pageSize: ps } = parsePagination(page, pageSize);
    return this.concessions.list(auth, { status, kind, search, studentId }, p, ps);
  }

  @Post()
  @RequirePermission('discount.request')
  async create(@Body(new ZodValidationPipe(createConcessionSchema)) body: CreateConcessionInput, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.concessions.create(auth, body, requestMeta(req));
  }

  @Post(':id/approve')
  @RequirePermission('discount.approve')
  async approve(@Param('id') id: string, @Body(new ZodValidationPipe(decideRefundSchema)) body: DecideRefundInput, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.concessions.approve(auth, id, body.note, requestMeta(req));
  }

  @Post(':id/reject')
  @RequirePermission('discount.approve')
  async reject(@Param('id') id: string, @Body(new ZodValidationPipe(rejectRefundSchema)) body: RejectRefundInput, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.concessions.reject(auth, id, body.note, requestMeta(req));
  }

  @Post(':id/apply')
  @RequirePermission('discount.apply')
  async apply(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.concessions.apply(auth, id, requestMeta(req));
  }
}
