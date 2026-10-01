import { BadRequestException, Controller, Get, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import type { AuthContext } from '../authorization/authorization.types';
import { parsePagination } from '../common/pagination.util';
import { sendCsv, toCsv } from '../common/csv.util';
import { ReportsService } from './reports.service';

function requireQueryParam(value: string | undefined, name: string): string {
  if (!value) {
    throw new BadRequestException({ code: 'VALIDATION_FAILED', message: `${name} is required.` });
  }
  return value;
}

// Report data itself has no single resourceId to run authorizeResource()
// against (it's a school-wide aggregate) — ReportsService enforces
// ALL_SCHOOL scope internally instead. @RequirePermission still gates
// every route the normal way: report.view for the JSON endpoints,
// report.export separately for the CSV downloads, so a role could in
// principle see reports on-screen without being able to export them.
@Controller('reports')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('students')
  @RequirePermission('report.view')
  async students(
    @Query('classId') classId: string | undefined,
    @Query('sectionId') sectionId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('search') search: string | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    const { page: p, pageSize: ps } = parsePagination(page, pageSize);
    return this.reportsService.studentsReport(auth, { classId, sectionId, status, search }, p, ps);
  }

  @Get('students/export')
  @RequirePermission('report.export')
  async studentsExport(
    @Query('classId') classId: string | undefined,
    @Query('sectionId') sectionId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('search') search: string | undefined,
    @CurrentAuthContext() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const rows = await this.reportsService.studentsReportRows(auth, { classId, sectionId, status, search });
    const csv = toCsv(rows, [
      { key: 'admissionNo', header: 'Admission No' },
      { key: 'firstName', header: 'First Name' },
      { key: 'lastName', header: 'Last Name' },
      { key: 'status', header: 'Status' },
      { key: 'gender', header: 'Gender' },
      { key: 'className', header: 'Class' },
      { key: 'sectionName', header: 'Section' },
    ]);
    return sendCsv(res, csv, 'student-report.csv');
  }

  @Get('attendance')
  @RequirePermission('report.view')
  async attendance(
    @Query('classId') classId: string | undefined,
    @Query('sectionId') sectionId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('search') search: string | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    const requiredFrom = requireQueryParam(from, 'from');
    const requiredTo = requireQueryParam(to, 'to');
    const { page: p, pageSize: ps } = parsePagination(page, pageSize);
    return this.reportsService.attendanceReport(
      auth,
      { classId, sectionId, from: requiredFrom, to: requiredTo, search },
      p,
      ps,
    );
  }

  @Get('attendance/export')
  @RequirePermission('report.export')
  async attendanceExport(
    @Query('classId') classId: string | undefined,
    @Query('sectionId') sectionId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('search') search: string | undefined,
    @CurrentAuthContext() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const requiredFrom = requireQueryParam(from, 'from');
    const requiredTo = requireQueryParam(to, 'to');
    const rows = await this.reportsService.attendanceReportRows(auth, {
      classId,
      sectionId,
      from: requiredFrom,
      to: requiredTo,
      search,
    });
    const csv = toCsv(rows, [
      { key: 'admissionNo', header: 'Admission No' },
      { key: 'firstName', header: 'First Name' },
      { key: 'lastName', header: 'Last Name' },
      { key: 'className', header: 'Class' },
      { key: 'sectionName', header: 'Section' },
      { key: 'present', header: 'Present' },
      { key: 'absent', header: 'Absent' },
      { key: 'late', header: 'Late' },
      { key: 'excused', header: 'Excused' },
      { key: 'totalMarked', header: 'Total Marked' },
      { key: 'attendancePercent', header: 'Attendance %' },
    ]);
    return sendCsv(res, csv, 'attendance-report.csv');
  }

  @Get('fees')
  @RequirePermission('report.view')
  async fees(
    @Query('academicYearId') academicYearId: string | undefined,
    @Query('feeCategoryId') feeCategoryId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('search') search: string | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    const { page: p, pageSize: ps } = parsePagination(page, pageSize);
    return this.reportsService.feesReport(auth, { academicYearId, feeCategoryId, status, search }, p, ps);
  }

  @Get('fees/export')
  @RequirePermission('report.export')
  async feesExport(
    @Query('academicYearId') academicYearId: string | undefined,
    @Query('feeCategoryId') feeCategoryId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('search') search: string | undefined,
    @CurrentAuthContext() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const rows = await this.reportsService.feesReportRows(auth, { academicYearId, feeCategoryId, status, search });
    const csv = toCsv(rows, [
      { key: 'admissionNo', header: 'Admission No' },
      { key: 'firstName', header: 'First Name' },
      { key: 'lastName', header: 'Last Name' },
      { key: 'feeCategory', header: 'Fee Category' },
      { key: 'amountDueMinor', header: 'Amount Due (paise)' },
      { key: 'paidMinor', header: 'Paid (paise)' },
      { key: 'balanceMinor', header: 'Balance (paise)' },
      { key: 'status', header: 'Status' },
      { key: 'dueDate', header: 'Due Date' },
    ]);
    return sendCsv(res, csv, 'fee-report.csv');
  }
}
