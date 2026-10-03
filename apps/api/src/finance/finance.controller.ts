import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { sendFeeRemindersSchema } from '@schovexa/validation';
import type { SendFeeRemindersInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { AuthorizationService } from '../authorization/authorization.service';
import type { AuthContext } from '../authorization/authorization.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { buildPaginationMeta, parsePagination } from '../common/pagination.util';
import { requestMeta } from '../common/request-meta.util';
import { PrismaService } from '../prisma/prisma.service';
import { StudentsService } from '../students/students.service';
import { describeDevice } from '../auth/device.util';
import { schoolDateRange } from './date-range';
import { FinanceReportsService } from './finance-reports.service';
import type { ExportFormat, ReportFilters } from './finance-reports.service';
import { FinanceService } from './finance.service';

const FINANCE_AUDIT_MODULES = ['payment', 'refund', 'discount', 'fee', 'receipt', 'finance'];

const text = (v: string | undefined) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : undefined);

// The accountant's workspace. Each route names the one permission it needs; the
// finance-only student lookup (finance.student) is separate from student.view on
// purpose, so an accountant sees who owes what without seeing the whole student record.
@Controller()
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly reports: FinanceReportsService,
    private readonly students: StudentsService,
    private readonly authorization: AuthorizationService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('finance/config')
  @RequirePermission('fee.view')
  config(@CurrentAuthContext() auth: AuthContext) {
    return this.finance.config(auth.schoolId);
  }

  @Get('finance/classes')
  @RequirePermission('fee.view')
  classes(@CurrentAuthContext() auth: AuthContext) {
    return this.finance.classes(auth);
  }

  @Get('finance/dashboard')
  @RequirePermission('finance.dashboard')
  dashboard(@CurrentAuthContext() auth: AuthContext) {
    return this.finance.dashboard(auth);
  }

  // -- Limited student lookup ----------------------------------------------

  @Get('finance/students')
  @RequirePermission('finance.student')
  searchStudents(@Query('search') search: string | undefined, @Query('classId') classId: string | undefined, @Query('sectionId') sectionId: string | undefined, @CurrentAuthContext() auth: AuthContext) {
    return this.finance.searchStudents(auth, search, text(classId), text(sectionId));
  }

  @Get('finance/students/:id')
  @RequirePermission('finance.student')
  student(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    return this.finance.student(auth, id);
  }

  @Get('finance/students/:id/photo')
  @RequirePermission('finance.student')
  async studentPhoto(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    await this.authorization.authorizeResource(auth, 'Student', id);
    const { contentType, stream } = await this.students.getPhoto(auth.schoolId, id);
    res.set({ 'Content-Type': contentType, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(stream);
  }

  // -- Ledger, demand, reminders -------------------------------------------

  @Get('students/:id/ledger')
  @RequirePermission('fee.view')
  async ledger(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    await this.authorization.authorizeResource(auth, 'Student', id);
    return this.finance.ledger(auth.schoolId, id);
  }

  @Get('finance/demand')
  @RequirePermission('fee.view')
  demand(
    @Query('classId') classId: string | undefined,
    @Query('sectionId') sectionId: string | undefined,
    @Query('academicYearId') academicYearId: string | undefined,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.finance.demand(auth, { classId: text(classId), sectionId: text(sectionId), academicYearId: text(academicYearId) });
  }

  @Get('finance/demand/:studentId/pdf')
  @RequirePermission('fee.view')
  async demandPdf(@Param('studentId') studentId: string, @CurrentAuthContext() auth: AuthContext, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    await this.authorization.authorizeResource(auth, 'Student', studentId);
    const pdf = await this.finance.demandPdf(auth, studentId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="fee-demand.pdf"' });
    return new StreamableFile(pdf);
  }

  @Post('finance/reminders')
  @RequirePermission('feeNotice.send')
  sendReminders(@Body(new ZodValidationPipe(sendFeeRemindersSchema)) body: SendFeeRemindersInput, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.finance.sendReminders(auth, body, requestMeta(req));
  }

  @Get('finance/reminders')
  @RequirePermission('feeNotice.send')
  reminderLog(@Query('page') page: string | undefined, @Query('pageSize') pageSize: string | undefined, @CurrentAuthContext() auth: AuthContext) {
    const { page: p, pageSize: ps } = parsePagination(page, pageSize);
    return this.finance.reminderLog(auth, p, ps);
  }

  // -- Reports and exports -------------------------------------------------

  private filters(q: Record<string, string | undefined>): ReportFilters {
    return { from: text(q.from), to: text(q.to), classId: text(q.classId), sectionId: text(q.sectionId), method: text(q.method) };
  }

  private kind(value: string) {
    if (!FinanceReportsService.isKind(value)) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown report.' });
    return value;
  }

  @Get('finance/reports/:kind')
  @RequirePermission('financeReport.view')
  report(@Param('kind') kind: string, @Query() query: Record<string, string | undefined>, @CurrentAuthContext() auth: AuthContext) {
    return this.reports.run(auth, this.kind(kind), this.filters(query));
  }

  @Get('finance/reports/:kind/export')
  @RequirePermission('financeReport.export')
  async exportReport(
    @Param('kind') kind: string,
    @Query() query: Record<string, string | undefined>,
    @CurrentAuthContext() auth: AuthContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const format = (text(query.format) ?? 'csv').toLowerCase() as ExportFormat;
    const file = await this.reports.export(auth, this.kind(kind), format, this.filters(query), requestMeta(req));
    res.set({ 'Content-Type': file.contentType, 'Content-Disposition': `attachment; filename="${file.filename}"`, 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(file.buffer);
  }

  // -- Finance activity log (the finance slice of the audit trail) ----------

  @Get('finance/audit')
  @RequirePermission('finance.audit')
  async audit(
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @Query('module') module: string | undefined,
    @Query('action') action: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('q') q: string | undefined,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    const { page: p, pageSize: ps } = parsePagination(page, pageSize);
    const range = await schoolDateRange(this.prisma, auth.schoolId, text(from), text(to));
    const term = text(q);
    const where = {
      schoolId: auth.schoolId,
      // Only finance activity — never sign-ins, role changes or anything else in the school's trail.
      module: module && FINANCE_AUDIT_MODULES.includes(module) ? module : { in: FINANCE_AUDIT_MODULES },
      ...(text(action) ? { action: text(action) } : {}),
      ...(Object.keys(range).length ? { createdAt: range } : {}),
      ...(term
        ? {
            OR: [
              { action: { contains: term, mode: 'insensitive' as const } },
              { resourceId: { contains: term, mode: 'insensitive' as const } },
              { actor: { OR: [{ firstName: { contains: term, mode: 'insensitive' as const } }, { lastName: { contains: term, mode: 'insensitive' as const } }] } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({ where, include: { actor: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, skip: (p - 1) * ps, take: ps }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        action: r.action,
        module: r.module,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        actor: r.actor ? { id: r.actor.id, name: `${r.actor.firstName} ${r.actor.lastName}`.trim() } : null,
        device: r.userAgent ? describeDevice(r.userAgent).label : null,
        metadata: r.metadata,
      })),
      pagination: buildPaginationMeta(p, ps, total),
      modules: FINANCE_AUDIT_MODULES,
    };
  }
}
