import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { createRefundSchema, decideRefundSchema, rejectRefundSchema } from '@schovexa/validation';
import type { CreateRefundInput, DecideRefundInput, RejectRefundInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { parsePagination } from '../common/pagination.util';
import { requestMeta } from '../common/request-meta.util';
import { RefundsService } from './refunds.service';
import type { AuthContext } from '../authorization/authorization.types';

// refund.request → refund.approve → refund.process: three different permissions,
// so the school decides who may do which. By default the accountant requests and
// pays out; the Principal and Director approve.
@Controller('refunds')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Get()
  @RequirePermission('refund.view')
  async list(
    @Query('status') status: string | undefined,
    @Query('search') search: string | undefined,
    @Query('studentId') studentId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    const { page: p, pageSize: ps } = parsePagination(page, pageSize);
    return this.refunds.list(auth, { status, search, studentId, from, to }, p, ps);
  }

  @Post()
  @RequirePermission('refund.request')
  async create(@Body(new ZodValidationPipe(createRefundSchema)) body: CreateRefundInput, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.refunds.create(auth, body, requestMeta(req));
  }

  @Post(':id/approve')
  @RequirePermission('refund.approve')
  async approve(@Param('id') id: string, @Body(new ZodValidationPipe(decideRefundSchema)) body: DecideRefundInput, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.refunds.approve(auth, id, body.note, requestMeta(req));
  }

  @Post(':id/reject')
  @RequirePermission('refund.approve')
  async reject(@Param('id') id: string, @Body(new ZodValidationPipe(rejectRefundSchema)) body: RejectRefundInput, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.refunds.reject(auth, id, body.note, requestMeta(req));
  }

  @Post(':id/withdraw')
  @RequirePermission('refund.request')
  async withdraw(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.refunds.withdraw(auth, id, requestMeta(req));
  }

  @Post(':id/process')
  @RequirePermission('refund.process')
  async process(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.refunds.process(auth, id, requestMeta(req));
  }
}
