import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { assignFeeToStudentSchema, recordPaymentSchema, updateStudentFeeSchema } from '@schovexa/validation';
import type { AssignFeeToStudentInput, RecordPaymentInput, UpdateStudentFeeInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { AuthorizationService } from '../authorization/authorization.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { StudentFeesService } from './student-fees.service';
import type { AuthContext } from '../authorization/authorization.types';

@Controller()
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class StudentFeesController {
  constructor(
    private readonly studentFeesService: StudentFeesService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Get('students/:studentId/fees')
  @RequirePermission('fee.view')
  async listForStudent(@Param('studentId') studentId: string, @CurrentAuthContext() auth: AuthContext) {
    await this.authorizationService.authorizeResource(auth, 'Student', studentId);
    return this.studentFeesService.listForStudent(auth.schoolId, studentId);
  }

  @Post('students/:studentId/fees')
  @RequirePermission('fee.create')
  async assign(
    @Param('studentId') studentId: string,
    @Body(new ZodValidationPipe(assignFeeToStudentSchema)) body: AssignFeeToStudentInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    await this.authorizationService.authorizeResource(auth, 'Student', studentId);
    return this.studentFeesService.assign(auth.schoolId, studentId, body);
  }

  @Patch('student-fees/:id')
  @RequirePermission('fee.create')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateStudentFeeSchema)) body: UpdateStudentFeeInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    const fee = await this.studentFeesService.findForAuth(auth.schoolId, id);
    await this.authorizationService.authorizeResource(auth, 'Student', fee.studentId);
    return this.studentFeesService.update(auth.schoolId, id, body);
  }

  @Patch('student-fees/:id/waive')
  @RequirePermission('fee.refund')
  async waive(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    const fee = await this.studentFeesService.findForAuth(auth.schoolId, id);
    await this.authorizationService.authorizeResource(auth, 'Student', fee.studentId);
    return this.studentFeesService.waive(auth.schoolId, id);
  }

  @Get('student-fees/:id/payments')
  @RequirePermission('fee.view')
  async listPayments(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    const fee = await this.studentFeesService.findForAuth(auth.schoolId, id);
    await this.authorizationService.authorizeResource(auth, 'Student', fee.studentId);
    return this.studentFeesService.listPayments(auth.schoolId, id);
  }

  @Post('student-fees/:id/payments')
  @RequirePermission('fee.collect')
  async recordPayment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(recordPaymentSchema)) body: RecordPaymentInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    const fee = await this.studentFeesService.findForAuth(auth.schoolId, id);
    await this.authorizationService.authorizeResource(auth, 'Student', fee.studentId);
    return this.studentFeesService.recordPayment(auth.schoolId, id, auth.userId, body);
  }

  @Get('fees/outstanding')
  @RequirePermission('fee.view')
  async outstanding(
    @Query('academicYearId') academicYearId: string | undefined,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.studentFeesService.outstanding(auth.schoolId, academicYearId);
  }
}
