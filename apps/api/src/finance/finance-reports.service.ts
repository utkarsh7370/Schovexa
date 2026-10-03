import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { StudentFeeStatus } from '@prisma/client';
import { FINANCE_REPORT_KINDS } from '@schovexa/validation';
import type { FinanceReportKind } from '@schovexa/validation';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../authorization/authorization.types';
import { col, EXPORT_FORMATS, renderReport, sumOf } from '../common/tabular-report';
import type { ExportFormat, TabularReport } from '../common/tabular-report';
import { dateOnlyToIso, todayInTimezone } from '../common/dates.util';
import { PrismaService } from '../prisma/prisma.service';
import { schoolDateRange } from './date-range';
import { feeMoney } from './fee-math';
import { PAYMENT_METHOD_LABELS } from './payment-methods';

export interface ReportFilters {
  from?: string;
  to?: string;
  classId?: string;
  sectionId?: string;
  method?: string;
}

export interface FinanceReport extends TabularReport {
  kind: FinanceReportKind;
}

interface Meta {
  ipAddress: string | null;
  userAgent: string | null;
}

const TITLES: Record<FinanceReportKind, string> = {
  'daily-collection': 'Daily collection',
  'monthly-collection': 'Monthly collection',
  'by-class': 'Collection by class',
  'by-section': 'Collection by section',
  outstanding: 'Outstanding fees',
  overdue: 'Overdue fees',
  'payment-method': 'Collection by payment method',
  'cash-collection': 'Cash collection',
  'online-payments': 'Online payments',
  'failed-payments': 'Failed payments',
  refunds: 'Refunds',
  concessions: 'Discounts and concessions',
  scholarships: 'Scholarships',
  summary: 'Collection summary',
  transactions: 'Transactions',
};


type PaymentRow = Prisma.PaymentGetPayload<{
  include: { receipt: true; studentFee: { include: { student: { include: { section: { include: { class: true } } } }; feeStructure: { include: { feeCategory: true } } } } };
}>;

// Finance reports. Every report is the same shape — columns, rows, totals — so
// the screen, CSV, Excel and PDF are all rendered from one result and can never
// disagree with each other. Figures use the same fee arithmetic as the rest of
// finance (fee-math.ts).
@Injectable()
export class FinanceReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  static isKind(value: string): value is FinanceReportKind {
    return (FINANCE_REPORT_KINDS as readonly string[]).includes(value);
  }

  private requireSchoolWide(auth: AuthContext) {
    if (auth.scope !== 'ALL_SCHOOL') throw new ForbiddenException({ code: 'FORBIDDEN', message: 'This needs school-wide finance access.' });
  }

  private studentWhere(f: ReportFilters): Prisma.StudentWhereInput {
    return { ...(f.sectionId ? { sectionId: f.sectionId } : {}), ...(f.classId ? { section: { classId: f.classId } } : {}) };
  }

  private async users(ids: (string | null)[]) {
    const real = [...new Set(ids.filter((i): i is string => !!i))];
    const users = await this.prisma.user.findMany({ where: { id: { in: real } }, select: { id: true, firstName: true, lastName: true } });
    return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  }

  private async payments(auth: AuthContext, f: ReportFilters, extra: Prisma.PaymentWhereInput = {}): Promise<PaymentRow[]> {
    const range = await schoolDateRange(this.prisma, auth.schoolId, f.from, f.to);
    const method = f.method && ['CASH', 'CHEQUE', 'BANK_TRANSFER', 'ONLINE'].includes(f.method) ? (f.method as 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'ONLINE') : undefined;
    return this.prisma.payment.findMany({
      where: {
        schoolId: auth.schoolId,
        deletedAt: null,
        ...(Object.keys(range).length ? { paidAt: range } : {}),
        ...(method ? { method } : {}),
        studentFee: { student: this.studentWhere(f) },
        ...extra,
      },
      include: { receipt: true, studentFee: { include: { student: { include: { section: { include: { class: true } } } }, feeStructure: { include: { feeCategory: true } } } } },
      orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
      take: 50_000,
    });
  }

  private async openFees(auth: AuthContext, f: ReportFilters) {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: auth.schoolId }, select: { timezone: true } });
    const today = todayInTimezone(school.timezone);
    const fees = await this.prisma.studentFee.findMany({
      where: { schoolId: auth.schoolId, deletedAt: null, status: { in: [StudentFeeStatus.PENDING, StudentFeeStatus.PARTIALLY_PAID] }, student: { deletedAt: null, ...this.studentWhere(f) } },
      include: {
        student: { include: { section: { include: { class: true } } } },
        feeStructure: { include: { feeCategory: true } },
        payments: { where: { deletedAt: null } },
        refunds: { where: { status: 'PROCESSED' } },
      },
      orderBy: [{ dueDate: 'asc' }],
      take: 50_000,
    });
    return { today, fees: fees.filter((fee) => feeMoney(fee).balanceMinor > 0) };
  }

  private bucketPayments(rows: PaymentRow[], keyOf: (p: PaymentRow) => string) {
    const map = new Map<string, { count: number; amountMinor: number }>();
    for (const p of rows) {
      const k = keyOf(p);
      const e = map.get(k) ?? { count: 0, amountMinor: 0 };
      e.count += 1;
      e.amountMinor += p.amountMinor;
      map.set(k, e);
    }
    return map;
  }

  async run(auth: AuthContext, kind: FinanceReportKind, filters: ReportFilters): Promise<FinanceReport> {
    this.requireSchoolWide(auth);
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: auth.schoolId }, select: { timezone: true } });
    const dayOf = (d: Date) => todayInTimezone(school.timezone, d);
    const base = { kind, title: TITLES[kind], generatedAt: new Date().toISOString(), note: null as string | null };

    switch (kind) {
      case 'transactions': {
        const payments = await this.payments(auth, filters);
        const cashiers = await this.users(payments.map((p) => p.collectedById));
        const rows = payments.map((p) => ({
          date: dayOf(p.paidAt),
          receiptNo: p.receipt?.receiptNo ?? null,
          admissionNo: p.studentFee.student.admissionNo,
          student: `${p.studentFee.student.firstName} ${p.studentFee.student.lastName}`.trim(),
          className: p.studentFee.student.section?.class.name ?? null,
          sectionName: p.studentFee.student.section?.name ?? null,
          fee: p.studentFee.feeStructure.feeCategory.name,
          method: PAYMENT_METHOD_LABELS[p.method] ?? p.method,
          reference: p.reference,
          collectedBy: cashiers.get(p.collectedById) ?? null,
          amountMinor: p.amountMinor,
        }));
        return {
          ...base,
          columns: [col('date', 'Date', 'date'), col('receiptNo', 'Receipt no.'), col('admissionNo', 'Admission no.'), col('student', 'Student'), col('className', 'Class'), col('sectionName', 'Section'), col('fee', 'Fee'), col('method', 'Method'), col('reference', 'Reference'), col('collectedBy', 'Collected by'), col('amountMinor', 'Amount', 'money')],
          rows,
          totals: [{ label: 'Transactions', value: rows.length, type: 'number' }, { label: 'Total collected', value: sumOf(rows, 'amountMinor'), type: 'money' }],
        };
      }

      case 'daily-collection':
      case 'monthly-collection': {
        const payments = await this.payments(auth, filters);
        const monthly = kind === 'monthly-collection';
        const buckets = this.bucketPayments(payments, (p) => (monthly ? dayOf(p.paidAt).slice(0, 7) : dayOf(p.paidAt)));
        const rows = [...buckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([period, v]) => ({ period, count: v.count, amountMinor: v.amountMinor }));
        return {
          ...base,
          columns: [col('period', monthly ? 'Month' : 'Date', monthly ? 'text' : 'date'), col('count', 'Payments', 'number'), col('amountMinor', 'Collected', 'money')],
          rows,
          totals: [{ label: 'Payments', value: sumOf(rows, 'count'), type: 'number' }, { label: 'Total collected', value: sumOf(rows, 'amountMinor'), type: 'money' }],
        };
      }

      case 'by-class':
      case 'by-section': {
        const bySection = kind === 'by-section';
        const fees = await this.prisma.studentFee.findMany({
          where: { schoolId: auth.schoolId, deletedAt: null, status: { not: StudentFeeStatus.WAIVED }, student: { deletedAt: null, ...this.studentWhere(filters) } },
          include: { student: { include: { section: { include: { class: true } } } }, payments: { where: { deletedAt: null } }, refunds: { where: { status: 'PROCESSED' } } },
          take: 100_000,
        });
        const groups = new Map<string, { name: string; students: Set<string>; billed: number; collected: number; outstanding: number }>();
        for (const fee of fees) {
          const sec = fee.student.section;
          const key = bySection ? (sec?.id ?? 'none') : (sec?.class.id ?? 'none');
          const name = bySection ? (sec ? `${sec.class.name} – ${sec.name}` : 'No section') : (sec?.class.name ?? 'No class');
          const g = groups.get(key) ?? { name, students: new Set<string>(), billed: 0, collected: 0, outstanding: 0 };
          const money = feeMoney(fee);
          g.students.add(fee.studentId);
          g.billed += money.netDueMinor;
          g.collected += money.paidMinor;
          g.outstanding += money.balanceMinor;
          groups.set(key, g);
        }
        const rows = [...groups.values()]
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
          .map((g) => ({ name: g.name, students: g.students.size, billedMinor: g.billed, collectedMinor: g.collected, outstandingMinor: g.outstanding }));
        return {
          ...base,
          columns: [col('name', bySection ? 'Section' : 'Class'), col('students', 'Students', 'number'), col('billedMinor', 'Billed (after discounts)', 'money'), col('collectedMinor', 'Collected', 'money'), col('outstandingMinor', 'Outstanding', 'money')],
          rows,
          totals: [{ label: 'Billed', value: sumOf(rows, 'billedMinor'), type: 'money' }, { label: 'Collected', value: sumOf(rows, 'collectedMinor'), type: 'money' }, { label: 'Outstanding', value: sumOf(rows, 'outstandingMinor'), type: 'money' }],
        };
      }

      case 'outstanding':
      case 'overdue': {
        const { today, fees } = await this.openFees(auth, filters);
        const onlyOverdue = kind === 'overdue';
        const rows = fees
          .map((fee) => {
            const money = feeMoney(fee);
            const dueIso = fee.dueDate ? dateOnlyToIso(fee.dueDate) : null;
            const daysOverdue = dueIso && dueIso < today ? Math.round((new Date(today).getTime() - new Date(dueIso).getTime()) / 86_400_000) : 0;
            return {
              admissionNo: fee.student.admissionNo,
              student: `${fee.student.firstName} ${fee.student.lastName}`.trim(),
              className: fee.student.section?.class.name ?? null,
              sectionName: fee.student.section?.name ?? null,
              fee: fee.feeStructure.feeCategory.name,
              dueDate: dueIso,
              daysOverdue,
              netDueMinor: money.netDueMinor,
              paidMinor: money.paidMinor,
              balanceMinor: money.balanceMinor,
            };
          })
          .filter((r) => !onlyOverdue || r.daysOverdue > 0)
          .sort((a, b) => b.daysOverdue - a.daysOverdue || b.balanceMinor - a.balanceMinor);
        return {
          ...base,
          columns: [col('admissionNo', 'Admission no.'), col('student', 'Student'), col('className', 'Class'), col('sectionName', 'Section'), col('fee', 'Fee'), col('dueDate', 'Due date', 'date'), col('daysOverdue', 'Days overdue', 'number'), col('netDueMinor', 'Billed', 'money'), col('paidMinor', 'Paid', 'money'), col('balanceMinor', 'Balance', 'money')],
          rows,
          totals: [{ label: 'Fees', value: rows.length, type: 'number' }, { label: 'Total outstanding', value: sumOf(rows, 'balanceMinor'), type: 'money' }],
        };
      }

      case 'payment-method': {
        const payments = await this.payments(auth, filters);
        const buckets = this.bucketPayments(payments, (p) => p.method);
        const rows = [...buckets.entries()].map(([method, v]) => ({ method: PAYMENT_METHOD_LABELS[method] ?? method, count: v.count, amountMinor: v.amountMinor }));
        return {
          ...base,
          columns: [col('method', 'Method'), col('count', 'Payments', 'number'), col('amountMinor', 'Collected', 'money')],
          rows,
          totals: [{ label: 'Total collected', value: sumOf(rows, 'amountMinor'), type: 'money' }],
        };
      }

      case 'cash-collection': {
        const payments = await this.payments(auth, { ...filters, method: 'CASH' });
        const cashiers = await this.users(payments.map((p) => p.collectedById));
        const buckets = this.bucketPayments(payments, (p) => `${dayOf(p.paidAt)}|${cashiers.get(p.collectedById) ?? 'Unknown'}`);
        const rows = [...buckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, v]) => {
          const [date, collectedBy] = key.split('|');
          return { date, collectedBy, count: v.count, amountMinor: v.amountMinor };
        });
        return {
          ...base,
          columns: [col('date', 'Date', 'date'), col('collectedBy', 'Collected by'), col('count', 'Payments', 'number'), col('amountMinor', 'Cash collected', 'money')],
          rows,
          totals: [{ label: 'Cash collected', value: sumOf(rows, 'amountMinor'), type: 'money' }],
        };
      }

      case 'online-payments':
      case 'failed-payments':
        return {
          ...base,
          columns: [col('date', 'Date', 'date'), col('student', 'Student'), col('amountMinor', 'Amount', 'money'), col('status', 'Status')],
          rows: [],
          totals: [],
          note: 'Online payments aren’t switched on for this school (cash only), so there is nothing to report. This report fills in once a payment gateway is connected.',
        };

      case 'refunds': {
        const range = await schoolDateRange(this.prisma, auth.schoolId, filters.from, filters.to);
        const refunds = await this.prisma.refundRequest.findMany({
          where: { schoolId: auth.schoolId, ...(Object.keys(range).length ? { createdAt: range } : {}), student: this.studentWhere(filters) },
          include: { student: { include: { section: { include: { class: true } } } }, payment: { include: { receipt: true } }, studentFee: { include: { feeStructure: { include: { feeCategory: true } } } } },
          orderBy: { createdAt: 'asc' },
          take: 50_000,
        });
        const names = await this.users(refunds.flatMap((r) => [r.requestedById, r.decidedById, r.processedById]));
        const rows = refunds.map((r) => ({
          date: dayOf(r.createdAt),
          receiptNo: r.payment.receipt?.receiptNo ?? null,
          admissionNo: r.student.admissionNo,
          student: `${r.student.firstName} ${r.student.lastName}`.trim(),
          className: r.student.section?.class.name ?? null,
          fee: r.studentFee.feeStructure.feeCategory.name,
          reason: r.reason,
          status: r.status,
          requestedBy: names.get(r.requestedById) ?? null,
          decidedBy: r.decidedById ? (names.get(r.decidedById) ?? null) : null,
          processedBy: r.processedById ? (names.get(r.processedById) ?? null) : null,
          amountMinor: r.amountMinor,
        }));
        return {
          ...base,
          columns: [col('date', 'Requested', 'date'), col('receiptNo', 'Receipt no.'), col('admissionNo', 'Admission no.'), col('student', 'Student'), col('className', 'Class'), col('fee', 'Fee'), col('reason', 'Reason'), col('status', 'Status'), col('requestedBy', 'Requested by'), col('decidedBy', 'Decided by'), col('processedBy', 'Paid out by'), col('amountMinor', 'Amount', 'money')],
          rows,
          totals: [
            { label: 'Requests', value: rows.length, type: 'number' },
            { label: 'Paid out', value: rows.filter((r) => r.status === 'PROCESSED').reduce((n, r) => n + r.amountMinor, 0), type: 'money' },
          ],
        };
      }

      case 'concessions':
      case 'scholarships': {
        const range = await schoolDateRange(this.prisma, auth.schoolId, filters.from, filters.to);
        const scholarships = kind === 'scholarships';
        const items = await this.prisma.concession.findMany({
          where: { schoolId: auth.schoolId, kind: scholarships ? 'SCHOLARSHIP' : { in: ['DISCOUNT', 'CONCESSION'] }, ...(Object.keys(range).length ? { createdAt: range } : {}), student: this.studentWhere(filters) },
          include: { student: { include: { section: { include: { class: true } } } }, studentFee: { include: { feeStructure: { include: { feeCategory: true } } } } },
          orderBy: { createdAt: 'asc' },
          take: 50_000,
        });
        const names = await this.users(items.flatMap((c) => [c.requestedById, c.decidedById, c.appliedById]));
        const rows = items.map((c) => ({
          date: dayOf(c.createdAt),
          admissionNo: c.student.admissionNo,
          student: `${c.student.firstName} ${c.student.lastName}`.trim(),
          className: c.student.section?.class.name ?? null,
          fee: c.studentFee.feeStructure.feeCategory.name,
          name: c.name,
          type: c.kind === 'DISCOUNT' ? 'Discount' : c.kind === 'SCHOLARSHIP' ? 'Scholarship' : 'Concession',
          reason: c.reason,
          status: c.status,
          requestedBy: names.get(c.requestedById) ?? null,
          decidedBy: c.decidedById ? (names.get(c.decidedById) ?? null) : null,
          appliedBy: c.appliedById ? (names.get(c.appliedById) ?? null) : null,
          amountMinor: c.amountMinor,
        }));
        return {
          ...base,
          columns: [col('date', 'Requested', 'date'), col('admissionNo', 'Admission no.'), col('student', 'Student'), col('className', 'Class'), col('fee', 'Fee'), col('name', 'Name'), col('type', 'Type'), col('reason', 'Reason'), col('status', 'Status'), col('requestedBy', 'Requested by'), col('decidedBy', 'Approved by'), col('appliedBy', 'Applied by'), col('amountMinor', 'Amount', 'money')],
          rows,
          totals: [
            { label: 'Entries', value: rows.length, type: 'number' },
            { label: 'Applied', value: rows.filter((r) => r.status === 'APPLIED').reduce((n, r) => n + r.amountMinor, 0), type: 'money' },
          ],
        };
      }

      case 'summary': {
        const payments = await this.payments(auth, filters);
        const range = await schoolDateRange(this.prisma, auth.schoolId, filters.from, filters.to);
        const refundAgg = await this.prisma.refundRequest.aggregate({
          where: { schoolId: auth.schoolId, status: 'PROCESSED', ...(Object.keys(range).length ? { processedAt: range } : {}), student: this.studentWhere(filters) },
          _sum: { amountMinor: true },
          _count: true,
        });
        const { today, fees } = await this.openFees(auth, filters);
        const outstanding = fees.reduce((n, f) => n + feeMoney(f).balanceMinor, 0);
        const overdue = fees.filter((f) => f.dueDate && dateOnlyToIso(f.dueDate) < today).reduce((n, f) => n + feeMoney(f).balanceMinor, 0);
        const concessionAgg = await this.prisma.concession.aggregate({
          where: { schoolId: auth.schoolId, status: 'APPLIED', ...(Object.keys(range).length ? { appliedAt: range } : {}), student: this.studentWhere(filters) },
          _sum: { amountMinor: true },
          _count: true,
        });
        const gross = payments.reduce((n, p) => n + p.amountMinor, 0);
        const refunded = refundAgg._sum.amountMinor ?? 0;
        const rows = [
          { metric: 'Payments received', count: payments.length, amountMinor: gross },
          { metric: 'Refunds paid out', count: refundAgg._count, amountMinor: refunded },
          { metric: 'Net collection', count: null, amountMinor: gross - refunded },
          { metric: 'Discounts and concessions applied', count: concessionAgg._count, amountMinor: concessionAgg._sum.amountMinor ?? 0 },
          { metric: 'Outstanding now', count: fees.length, amountMinor: outstanding },
          { metric: 'Of which overdue', count: fees.filter((f) => f.dueDate && dateOnlyToIso(f.dueDate) < today).length, amountMinor: overdue },
        ];
        return {
          ...base,
          columns: [col('metric', 'Measure'), col('count', 'Count', 'number'), col('amountMinor', 'Amount', 'money')],
          rows,
          totals: [],
          note: 'Outstanding figures are as of today; the rest follow the date range.',
        };
      }
    }
  }

  // -- Export ----------------------------------------------------------------

  /** Builds the file, and records that this person exported this data — exports are always logged. */
  async export(auth: AuthContext, kind: FinanceReportKind, format: ExportFormat, filters: ReportFilters, meta: Meta) {
    if (!EXPORT_FORMATS.includes(format)) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Choose csv, xlsx or pdf.' });
    const report = await this.run(auth, kind, filters);
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: auth.schoolId }, select: { name: true } });
    const { buffer, contentType } = await renderReport(report, format, school.name);
    await this.audit.record({
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'finance.export',
      module: 'finance',
      resourceType: 'FinanceReport',
      resourceId: kind,
      metadata: { report: kind, format, rows: report.rows.length, filters: JSON.parse(JSON.stringify(filters)) as Prisma.InputJsonValue },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return { buffer, contentType, filename: `finance-${kind}-${dateOnlyToIso(new Date())}.${format}` };
  }
}
