import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { correctPaymentSchema } from '@schovexa/validation';
import type { CorrectPaymentInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { parsePagination } from '../common/pagination.util';
import { requestMeta } from '../common/request-meta.util';
import { PaymentsService } from './payments.service';
import type { AuthContext } from '../authorization/authorization.types';

// Transactions: what has been collected. Reading needs fee.view (school-wide);
// correcting a payment is its own permission, payment.correct.
@Controller('payments')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermission('fee.view')
  async list(
    @Query('search') search: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('method') method: string | undefined,
    @Query('classId') classId: string | undefined,
    @Query('sectionId') sectionId: string | undefined,
    @Query('studentId') studentId: string | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    const { page: p, pageSize: ps } = parsePagination(page, pageSize);
    return this.payments.list(auth, { search, from, to, method, classId, sectionId, studentId }, p, ps);
  }

  @Get(':id')
  @RequirePermission('fee.view')
  async detail(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    return this.payments.detail(auth, id);
  }

  @Patch(':id')
  @RequirePermission('payment.correct')
  async correct(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(correctPaymentSchema)) body: CorrectPaymentInput,
    @CurrentAuthContext() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.payments.correct(auth, id, body, requestMeta(req));
  }
}
