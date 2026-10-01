import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { approveAllStaffAttendanceSchema, approveStaffAttendanceSchema, rejectStaffAttendanceSchema } from '@schovexa/validation';
import type { ApproveAllStaffAttendanceInput, ApproveStaffAttendanceInput, RejectStaffAttendanceInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { StaffAttendanceService } from './staff-attendance.service';
import type { AuthContext } from '../authorization/authorization.types';

// Staff attendance has two audiences:
//   everyone with staffAttendance.mark — punches THEMSELVES in/out (the
//     userId always comes from the session, never from the request);
//   staffAttendance.view / .approve — sees the whole staff and decides days.
// A biometric device will later write rows with source BIOMETRIC through
// the same service; nothing here needs to change for it.
@Controller('staff-attendance')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class StaffAttendanceController {
  constructor(private readonly staffAttendanceService: StaffAttendanceService) {}

  @Get('today')
  @RequirePermission('staffAttendance.mark')
  async today(@CurrentAuthContext() auth: AuthContext) {
    return this.staffAttendanceService.today(auth);
  }

  @Post('punch-in')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('staffAttendance.mark')
  async punchIn(@CurrentAuthContext() auth: AuthContext) {
    return this.staffAttendanceService.punchIn(auth);
  }

  @Post('punch-out')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('staffAttendance.mark')
  async punchOut(@CurrentAuthContext() auth: AuthContext) {
    return this.staffAttendanceService.punchOut(auth);
  }

  @Get('mine')
  @RequirePermission('staffAttendance.mark')
  async mine(@Query('month') month: string | undefined, @CurrentAuthContext() auth: AuthContext) {
    return this.staffAttendanceService.mine(auth, month);
  }

  @Get('roster')
  @RequirePermission('staffAttendance.view')
  async roster(@Query('date') date: string | undefined, @CurrentAuthContext() auth: AuthContext) {
    return this.staffAttendanceService.roster(auth, date);
  }

  @Get('pending')
  @RequirePermission('staffAttendance.approve')
  async pending(@CurrentAuthContext() auth: AuthContext) {
    return this.staffAttendanceService.pending(auth);
  }

  // Declared before ':id/…' so "approve-all" is never taken for an id.
  @Post('approve-all')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('staffAttendance.approve')
  async approveAll(
    @Body(new ZodValidationPipe(approveAllStaffAttendanceSchema)) body: ApproveAllStaffAttendanceInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.staffAttendanceService.approveAll(auth, body.date);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('staffAttendance.approve')
  async approve(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(approveStaffAttendanceSchema)) body: ApproveStaffAttendanceInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.staffAttendanceService.approve(auth, id, body.note);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('staffAttendance.approve')
  async reject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rejectStaffAttendanceSchema)) body: RejectStaffAttendanceInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.staffAttendanceService.reject(auth, id, body.note);
  }
}
