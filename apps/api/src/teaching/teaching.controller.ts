import { BadRequestException, Controller, Get, Param, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import type { AuthContext } from '../authorization/authorization.types';
import { requestMeta } from '../common/request-meta.util';
import type { ExportFormat } from '../common/tabular-report';
import { TeachingDashboardService } from './teaching-dashboard.service';
import { TeachingReportsService } from './teaching-reports.service';
import type { TeachingReportFilters } from './teaching-reports.service';

const text = (v: string | undefined) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : undefined);
const isoDay = /^\d{4}-\d{2}-\d{2}$/;

@Controller('teaching')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class TeachingController {
  constructor(
    private readonly dashboard: TeachingDashboardService,
    private readonly reports: TeachingReportsService,
  ) {}

  // "What do I need to do today?"
  @Get('dashboard')
  @RequirePermission('teaching.dashboard')
  getDashboard(@CurrentAuthContext() auth: AuthContext) {
    return this.dashboard.dashboard(auth);
  }

  // Everything dated that concerns me, for the calendar: holidays, events, my exams, work due, my leave.
  @Get('agenda')
  @RequirePermission('teaching.dashboard')
  agenda(@Query('from') from: string | undefined, @Query('to') to: string | undefined, @CurrentAuthContext() auth: AuthContext) {
    if (!from || !to || !isoDay.test(from) || !isoDay.test(to) || to < from) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'from and to are required, like 2026-10-01.' });
    return this.dashboard.agenda(auth, from, to);
  }

  private filters(q: Record<string, string | undefined>): TeachingReportFilters {
    return { from: text(q.from), to: text(q.to), sectionId: text(q.sectionId), subjectId: text(q.subjectId), examId: text(q.examId) };
  }

  private kind(value: string) {
    if (!TeachingReportsService.isKind(value)) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown report.' });
    return value;
  }

  @Get('reports/:kind')
  @RequirePermission('teachingReport.view')
  report(@Param('kind') kind: string, @Query() query: Record<string, string | undefined>, @CurrentAuthContext() auth: AuthContext) {
    return this.reports.run(auth, this.kind(kind), this.filters(query));
  }

  @Get('reports/:kind/export')
  @RequirePermission('teachingReport.export')
  async exportReport(@Param('kind') kind: string, @Query() query: Record<string, string | undefined>, @CurrentAuthContext() auth: AuthContext, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const format = (text(query.format) ?? 'csv').toLowerCase() as ExportFormat;
    const file = await this.reports.export(auth, this.kind(kind), format, this.filters(query), requestMeta(req));
    res.set({ 'Content-Type': file.contentType, 'Content-Disposition': `attachment; filename="${file.filename}"`, 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(file.buffer);
  }
}
