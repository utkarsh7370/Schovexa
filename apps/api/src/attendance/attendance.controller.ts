import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { markAttendanceSchema, updateAttendanceSchema } from '@schovexa/validation';
import type { MarkAttendanceInput, UpdateAttendanceInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { AuthorizationService } from '../authorization/authorization.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AttendanceService } from './attendance.service';
import type { AuthContext } from '../authorization/authorization.types';

function requireQueryParam(value: string | undefined, name: string): string {
  if (!value) {
    throw new BadRequestException({ code: 'VALIDATION_FAILED', message: `${name} is required.` });
  }
  return value;
}

@Controller('attendance')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Post()
  @RequirePermission('attendance.mark')
  async markBulk(
    @Body(new ZodValidationPipe(markAttendanceSchema)) body: MarkAttendanceInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    await this.authorizationService.authorizeResource(auth, 'Section', body.sectionId);
    return this.attendanceService.markBulk(auth.schoolId, auth.userId, body);
  }

  @Get()
  @RequirePermission('attendance.view')
  async getRoster(
    @Query('sectionId') sectionId: string | undefined,
    @Query('date') date: string | undefined,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    const requiredSectionId = requireQueryParam(sectionId, 'sectionId');
    const requiredDate = requireQueryParam(date, 'date');
    await this.authorizationService.authorizeResource(auth, 'Section', requiredSectionId);
    return this.attendanceService.getRosterForSectionDate(auth.schoolId, requiredSectionId, requiredDate);
  }

  @Get('history')
  @RequirePermission('attendance.view')
  async getHistory(
    @Query('studentId') studentId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    const requiredStudentId = requireQueryParam(studentId, 'studentId');
    const requiredFrom = requireQueryParam(from, 'from');
    const requiredTo = requireQueryParam(to, 'to');
    await this.authorizationService.authorizeResource(auth, 'Student', requiredStudentId);
    return this.attendanceService.getHistoryForStudent(auth.schoolId, requiredStudentId, requiredFrom, requiredTo);
  }

  @Get('summary')
  @RequirePermission('attendance.view')
  async getSummary(
    @Query('sectionId') sectionId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    const requiredSectionId = requireQueryParam(sectionId, 'sectionId');
    const requiredFrom = requireQueryParam(from, 'from');
    const requiredTo = requireQueryParam(to, 'to');
    await this.authorizationService.authorizeResource(auth, 'Section', requiredSectionId);
    return this.attendanceService.getSummaryForSection(auth.schoolId, requiredSectionId, requiredFrom, requiredTo);
  }

  @Patch(':id')
  @RequirePermission('attendance.update')
  async correct(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAttendanceSchema)) body: UpdateAttendanceInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    const record = await this.attendanceService.findForAuth(auth.schoolId, id);
    await this.authorizationService.authorizeResource(auth, 'Section', record.sectionId);
    return this.attendanceService.correct(id, body);
  }
}
