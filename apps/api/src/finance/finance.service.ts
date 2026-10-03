import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { StudentFeeStatus } from '@prisma/client';
import PDFDocument from 'pdfkit';
import type { SendFeeRemindersInput } from '@schovexa/validation';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../authorization/authorization.types';
import { dateOnlyToIso, localDayRange, todayInTimezone } from '../common/dates.util';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolSettingsService } from '../school-settings/school-settings.service';
import { feeMoney } from './fee-math';
import { FeeNotifierService } from './fee-notifier.service';
import { formatMoney } from './money';
import { enabledPaymentMethods, PAYMENT_METHOD_LABELS } from './payment-methods';

const FEE_FULL = {
  feeStructure: { include: { feeCategory: true } },
  payments: { where: { deletedAt: null } },
  refunds: { where: { status: 'PROCESSED' as const } },
} satisfies Prisma.StudentFeeInclude;

const requireSchoolWide = (auth: AuthContext) => {
  if (auth.scope !== 'ALL_SCHOOL') throw new ForbiddenException({ code: 'FORBIDDEN', message: 'This needs school-wide finance access.' });
};

const notFound = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });

interface Meta {
  ipAddress: string | null;
  userAgent: string | null;
}

// Everything an accountant needs that isn't one specific record type: the
// day-to-day dashboard, a limited student lookup, the fee ledger, fee demand
// statements and reminders.
@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SchoolSettingsService,
    private readonly notifier: FeeNotifierService,
    private readonly audit: AuditService,
  ) {}

  private async school(schoolId: string) {
    return this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { name: true, timezone: true } });
  }

  /** What this deployment and school allow — the screens read this instead of hard-coding it. */
  async config(schoolId: string) {
    const s = await this.settings.get(schoolId);
    const methods = enabledPaymentMethods();
    return {
      paymentMethods: methods.map((value) => ({ value, label: PAYMENT_METHOD_LABELS[value] ?? value })),
      onlinePaymentsEnabled: methods.includes('ONLINE'),
      allowPartialPayments: s.allowPartialPayments,
      maxDiscountPercent: s.maxDiscountPercent,
      paymentCorrectionWindowDays: s.paymentCorrectionWindowDays,
      receiptPrefix: s.receiptPrefix,
    };
  }

  /** Classes and their sections, for the finance filters — so finance doesn't need access to class management. */
  async classes(auth: AuthContext) {
    requireSchoolWide(auth);
    const classes = await this.prisma.class.findMany({
      where: { schoolId: auth.schoolId, deletedAt: null },
      include: { sections: { where: { deletedAt: null }, orderBy: { name: 'asc' } } },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
    return classes.map((c) => ({ id: c.id, name: c.name, sections: c.sections.map((s) => ({ id: s.id, name: s.name })) }));
  }

  // -- Student lookup (limited view) --------------------------------------

  private async feeTotals(schoolId: string, studentIds: string[], today: string) {
    const fees = await this.prisma.studentFee.findMany({
      where: { schoolId, studentId: { in: studentIds }, deletedAt: null, status: { not: StudentFeeStatus.WAIVED } },
      include: { payments: { where: { deletedAt: null }, select: { amountMinor: true } }, refunds: { where: { status: 'PROCESSED' }, select: { amountMinor: true, status: true } } },
    });
    const totals = new Map<string, { netDueMinor: number; paidMinor: number; balanceMinor: number; overdueMinor: number }>();
    for (const fee of fees) {
      const money = feeMoney(fee);
      const t = totals.get(fee.studentId) ?? { netDueMinor: 0, paidMinor: 0, balanceMinor: 0, overdueMinor: 0 };
      t.netDueMinor += money.netDueMinor;
      t.paidMinor += money.paidMinor;
      t.balanceMinor += money.balanceMinor;
      if (money.balanceMinor > 0 && fee.dueDate && dateOnlyToIso(fee.dueDate) < today) t.overdueMinor += money.balanceMinor;
      totals.set(fee.studentId, t);
    }
    return totals;
  }

  /**
   * Find a student to collect from. Deliberately limited: name, admission
   * number, class, section, status, a photo and what they owe — never date of
   * birth, gender, documents, attendance or results.
   */
  async searchStudents(auth: AuthContext, search: string | undefined, classId?: string, sectionId?: string) {
    requireSchoolWide(auth);
    const terms = (search ?? '').trim().slice(0, 80).split(/\s+/).filter(Boolean);
    if (terms.length === 0 && !classId && !sectionId) return { data: [] };
    const where: Prisma.StudentWhereInput = {
      schoolId: auth.schoolId,
      deletedAt: null,
      ...(sectionId ? { sectionId } : {}),
      ...(classId ? { section: { classId } } : {}),
      ...(terms.length
        ? {
            AND: terms.map((term) => {
              const contains = { contains: term, mode: 'insensitive' as const };
              return { OR: [{ firstName: contains }, { lastName: contains }, { admissionNo: contains }, { parents: { some: { parent: { OR: [{ firstName: contains }, { lastName: contains }, { phone: contains }] } } } }] };
            }),
          }
        : {}),
    };
    const students = await this.prisma.student.findMany({
      where,
      include: { section: { include: { class: true } } },
      orderBy: [{ admissionNo: 'asc' }],
      take: 25,
    });
    const school = await this.school(auth.schoolId);
    const totals = await this.feeTotals(auth.schoolId, students.map((s) => s.id), todayInTimezone(school.timezone));
    return {
      data: students.map((s) => ({
        id: s.id,
        admissionNo: s.admissionNo,
        name: `${s.firstName} ${s.lastName}`.trim(),
        photoUrl: s.photoKey ? `/finance/students/${s.id}/photo` : null,
        className: s.section?.class.name ?? null,
        sectionName: s.section?.name ?? null,
        status: s.status,
        balanceMinor: totals.get(s.id)?.balanceMinor ?? 0,
        overdueMinor: totals.get(s.id)?.overdueMinor ?? 0,
      })),
    };
  }

  /** One student, as finance sees them: identity, class, parents' contact, and the fee picture. */
  async student(auth: AuthContext, studentId: string) {
    requireSchoolWide(auth);
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId: auth.schoolId, deletedAt: null },
      include: { section: { include: { class: true } }, parents: { include: { parent: true }, orderBy: { isPrimary: 'desc' } } },
    });
    if (!student) throw notFound();
    const school = await this.school(auth.schoolId);
    const today = todayInTimezone(school.timezone);
    const fees = await this.prisma.studentFee.findMany({ where: { studentId, schoolId: auth.schoolId, deletedAt: null }, include: FEE_FULL, orderBy: { createdAt: 'desc' } });
    const rules = await this.settings.get(auth.schoolId);
    const feeRows = fees.map((fee) => {
      const money = feeMoney(fee);
      const overdue = !!fee.dueDate && money.balanceMinor > 0 && fee.status !== StudentFeeStatus.WAIVED && dateOnlyToIso(fee.dueDate) < today;
      const daysOverdue = overdue ? Math.round((new Date(today).getTime() - new Date(dateOnlyToIso(fee.dueDate!)).getTime()) / 86_400_000) : 0;
      const daysLate = Math.max(0, daysOverdue - rules.lateFeeGraceDays);
      return {
        id: fee.id,
        feeCategory: fee.feeStructure.feeCategory.name,
        frequency: fee.feeStructure.frequency,
        amountDueMinor: fee.amountDueMinor,
        discountMinor: fee.discountMinor,
        netDueMinor: money.netDueMinor,
        paidMinor: money.paidMinor,
        refundedMinor: money.refundedMinor,
        balanceMinor: money.balanceMinor,
        dueDate: fee.dueDate,
        status: fee.status,
        overdue,
        daysLate,
        lateFeeMinor: daysLate * rules.lateFeePerDayMinor,
      };
    });
    const live = feeRows.filter((f) => f.status !== StudentFeeStatus.WAIVED);
    return {
      id: student.id,
      admissionNo: student.admissionNo,
      name: `${student.firstName} ${student.lastName}`.trim(),
      photoUrl: student.photoKey ? `/finance/students/${student.id}/photo` : null,
      status: student.status,
      className: student.section?.class.name ?? null,
      sectionName: student.section?.name ?? null,
      parents: student.parents
        .filter((l) => !l.parent.deletedAt)
        .map((l) => ({ id: l.parent.id, name: `${l.parent.firstName} ${l.parent.lastName}`.trim(), relation: l.relation, isPrimary: l.isPrimary, phone: l.parent.phone, email: l.parent.email })),
      summary: {
        netDueMinor: live.reduce((n, f) => n + f.netDueMinor, 0),
        paidMinor: live.reduce((n, f) => n + f.paidMinor, 0),
        balanceMinor: live.reduce((n, f) => n + f.balanceMinor, 0),
        overdueMinor: live.filter((f) => f.overdue).reduce((n, f) => n + f.balanceMinor, 0),
        discountMinor: live.reduce((n, f) => n + f.discountMinor, 0),
      },
      fees: feeRows,
    };
  }

  // -- Ledger ----------------------------------------------------------------

  /**
   * Every money event for a student in date order — fees billed, discounts,
   * payments, refunds — with a running balance. The one place to answer "how
   * did this family's balance get to be what it is?".
   */
  async ledger(schoolId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId, deletedAt: null },
      include: { section: { include: { class: true } } },
    });
    if (!student) throw notFound();
    const fees = await this.prisma.studentFee.findMany({
      where: { studentId, schoolId, deletedAt: null },
      include: {
        feeStructure: { include: { feeCategory: true } },
        payments: { where: { deletedAt: null }, include: { receipt: true } },
        refunds: { where: { status: 'PROCESSED' } },
        concessions: { where: { status: 'APPLIED' } },
      },
    });
    interface Entry {
      at: Date;
      type: 'CHARGE' | 'DISCOUNT' | 'PAYMENT' | 'REFUND' | 'WAIVER';
      description: string;
      reference: string | null;
      debitMinor: number;
      creditMinor: number;
    }
    const entries: Entry[] = [];
    for (const fee of fees) {
      const category = fee.feeStructure.feeCategory.name;
      entries.push({ at: fee.createdAt, type: 'CHARGE', description: `${category} billed`, reference: null, debitMinor: fee.amountDueMinor, creditMinor: 0 });
      if (fee.status === StudentFeeStatus.WAIVED) {
        const paid = fee.payments.reduce((n, p) => n + p.amountMinor, 0);
        entries.push({ at: fee.updatedAt, type: 'WAIVER', description: `${category} waived`, reference: null, debitMinor: 0, creditMinor: Math.max(fee.amountDueMinor - fee.discountMinor - paid, 0) });
      }
      for (const c of fee.concessions) {
        entries.push({ at: c.appliedAt ?? c.updatedAt, type: 'DISCOUNT', description: `${c.name} (${c.kind.toLowerCase()}) on ${category}`, reference: null, debitMinor: 0, creditMinor: c.amountMinor });
      }
      for (const p of fee.payments) {
        entries.push({ at: p.paidAt, type: 'PAYMENT', description: `Payment for ${category} (${PAYMENT_METHOD_LABELS[p.method] ?? p.method})`, reference: p.receipt?.receiptNo ?? p.reference, debitMinor: 0, creditMinor: p.amountMinor });
      }
      for (const r of fee.refunds) {
        entries.push({ at: r.processedAt ?? r.updatedAt, type: 'REFUND', description: `Refund on ${category}`, reference: null, debitMinor: r.amountMinor, creditMinor: 0 });
      }
    }
    const order = { CHARGE: 0, DISCOUNT: 1, WAIVER: 1, PAYMENT: 2, REFUND: 3 } as const;
    entries.sort((a, b) => a.at.getTime() - b.at.getTime() || order[a.type] - order[b.type]);
    let balance = 0;
    const rows = entries.map((e) => {
      balance += e.debitMinor - e.creditMinor;
      return { ...e, balanceMinor: balance };
    });
    return {
      student: { id: student.id, admissionNo: student.admissionNo, name: `${student.firstName} ${student.lastName}`.trim(), className: student.section?.class.name ?? null, sectionName: student.section?.name ?? null },
      entries: rows,
      totals: {
        billedMinor: entries.filter((e) => e.type === 'CHARGE').reduce((n, e) => n + e.debitMinor, 0),
        discountsMinor: entries.filter((e) => e.type === 'DISCOUNT' || e.type === 'WAIVER').reduce((n, e) => n + e.creditMinor, 0),
        paidMinor: entries.filter((e) => e.type === 'PAYMENT').reduce((n, e) => n + e.creditMinor, 0),
        refundedMinor: entries.filter((e) => e.type === 'REFUND').reduce((n, e) => n + e.debitMinor, 0),
        balanceMinor: balance,
      },
    };
  }

  // -- Fee demand ----------------------------------------------------------

  private demandWhere(auth: AuthContext, f: { classId?: string; sectionId?: string; academicYearId?: string; studentId?: string }): Prisma.StudentFeeWhereInput {
    return {
      schoolId: auth.schoolId,
      deletedAt: null,
      status: { in: [StudentFeeStatus.PENDING, StudentFeeStatus.PARTIALLY_PAID] },
      ...(f.studentId ? { studentId: f.studentId } : {}),
      ...(f.academicYearId ? { feeStructure: { academicYearId: f.academicYearId } } : {}),
      student: {
        deletedAt: null,
        ...(f.sectionId ? { sectionId: f.sectionId } : {}),
        ...(f.classId ? { section: { classId: f.classId } } : {}),
      },
    };
  }

  /** The fee demand: for each student with money outstanding, what is owed, on which fees, and what is overdue. */
  async demand(auth: AuthContext, filters: { classId?: string; sectionId?: string; academicYearId?: string; studentId?: string }) {
    requireSchoolWide(auth);
    const school = await this.school(auth.schoolId);
    const today = todayInTimezone(school.timezone);
    const fees = await this.prisma.studentFee.findMany({
      where: this.demandWhere(auth, filters),
      include: { ...FEE_FULL, student: { include: { section: { include: { class: true } }, parents: { include: { parent: true }, orderBy: { isPrimary: 'desc' } } } } },
      orderBy: [{ dueDate: 'asc' }],
    });
    const byStudent = new Map<string, { student: (typeof fees)[number]['student']; items: { id: string; feeCategory: string; dueDate: string | null; netDueMinor: number; paidMinor: number; balanceMinor: number; overdue: boolean }[] }>();
    for (const fee of fees) {
      const money = feeMoney(fee);
      if (money.balanceMinor === 0) continue;
      const entry = byStudent.get(fee.studentId) ?? { student: fee.student, items: [] };
      entry.items.push({
        id: fee.id,
        feeCategory: fee.feeStructure.feeCategory.name,
        dueDate: fee.dueDate ? dateOnlyToIso(fee.dueDate) : null,
        netDueMinor: money.netDueMinor,
        paidMinor: money.paidMinor,
        balanceMinor: money.balanceMinor,
        overdue: !!fee.dueDate && dateOnlyToIso(fee.dueDate) < today,
      });
      byStudent.set(fee.studentId, entry);
    }
    const data = [...byStudent.values()]
      .map(({ student, items }) => {
        const primary = student.parents.map((l) => l.parent).find((p) => !p.deletedAt);
        return {
          studentId: student.id,
          admissionNo: student.admissionNo,
          name: `${student.firstName} ${student.lastName}`.trim(),
          className: student.section?.class.name ?? null,
          sectionName: student.section?.name ?? null,
          parentName: primary ? `${primary.firstName} ${primary.lastName}`.trim() : null,
          parentPhone: primary?.phone ?? null,
          totalMinor: items.reduce((n, i) => n + i.balanceMinor, 0),
          overdueMinor: items.filter((i) => i.overdue).reduce((n, i) => n + i.balanceMinor, 0),
          fees: items,
        };
      })
      .sort((a, b) => b.overdueMinor - a.overdueMinor || b.totalMinor - a.totalMinor || a.name.localeCompare(b.name));
    return {
      asOf: today,
      data,
      totals: { students: data.length, totalMinor: data.reduce((n, d) => n + d.totalMinor, 0), overdueMinor: data.reduce((n, d) => n + d.overdueMinor, 0) },
    };
  }

  /** A printable fee demand statement for one student (A4 PDF). */
  async demandPdf(auth: AuthContext, studentId: string): Promise<Buffer> {
    const demand = await this.demand(auth, { studentId });
    const school = await this.school(auth.schoolId);
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId: auth.schoolId, deletedAt: null }, include: { section: { include: { class: true } } } });
    if (!student) throw notFound();
    const row = demand.data[0];
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      // Helvetica has no ₹ glyph — the PDF writes "Rs." instead.
      const money = (n: number) => formatMoney(n).replace('₹', 'Rs. ');
      doc.fontSize(18).text(school.name, { align: 'center' });
      doc.fontSize(13).text('Fee demand statement', { align: 'center' }).moveDown();
      doc.fontSize(10);
      doc.text(`Student: ${student.firstName} ${student.lastName}    Admission no.: ${student.admissionNo}`);
      doc.text(`Class: ${student.section ? `${student.section.class.name} – ${student.section.name}` : '—'}    As of: ${demand.asOf}`).moveDown();
      if (!row) {
        doc.text('Nothing is outstanding. This account is clear.');
      } else {
        const col = [50, 230, 320, 410, 490];
        doc.font('Helvetica-Bold');
        ['Fee', 'Due date', 'Billed', 'Paid', 'Balance'].forEach((h, i) => doc.text(h, col[i], doc.y, { width: 80, continued: i < 4 }));
        doc.font('Helvetica').moveDown(0.3);
        for (const item of row.fees) {
          const y = doc.y;
          doc.text(item.feeCategory + (item.overdue ? ' (overdue)' : ''), col[0], y, { width: 170 });
          doc.text(item.dueDate ?? '—', col[1], y, { width: 80 });
          doc.text(money(item.netDueMinor), col[2], y, { width: 80 });
          doc.text(money(item.paidMinor), col[3], y, { width: 80 });
          doc.text(money(item.balanceMinor), col[4], y, { width: 70 });
          doc.moveDown(0.2);
        }
        doc.moveDown().font('Helvetica-Bold').text(`Total outstanding: ${money(row.totalMinor)}`, 50);
        if (row.overdueMinor > 0) doc.text(`Of which overdue: ${money(row.overdueMinor)}`);
      }
      doc.font('Helvetica').moveDown(2).fontSize(9).text('Please pay at the school fee office. Cash is accepted.', 50);
      doc.end();
    });
  }

  // -- Reminders -------------------------------------------------------------

  /** Remind families about unpaid fees — by selection, class, section or year. Skipped and failed sends are reported, not hidden. */
  async sendReminders(auth: AuthContext, input: SendFeeRemindersInput, meta: Meta) {
    requireSchoolWide(auth);
    if (input.studentFeeIds) {
      const owned = await this.prisma.studentFee.count({ where: { id: { in: input.studentFeeIds }, schoolId: auth.schoolId, deletedAt: null } });
      if (owned !== new Set(input.studentFeeIds).size) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Some of those fees weren’t found.' });
    }
    const school = await this.school(auth.schoolId);
    const today = todayInTimezone(school.timezone);
    const fees = await this.prisma.studentFee.findMany({
      where: {
        ...this.demandWhere(auth, input),
        ...(input.studentFeeIds ? { id: { in: input.studentFeeIds } } : {}),
      },
      include: { payments: { where: { deletedAt: null } }, refunds: { where: { status: 'PROCESSED' } } },
    });
    const targets = fees.filter((fee) => {
      if (feeMoney(fee).balanceMinor === 0) return false;
      const overdue = !!fee.dueDate && dateOnlyToIso(fee.dueDate) < today;
      return input.kind === 'OVERDUE' ? overdue : true;
    });
    if (targets.length > 300) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'That is more than 300 fees at once. Narrow it to a class or section.' });

    const summary = { fees: targets.length, parentsReached: 0, parentsUnreachable: 0, alreadyReminded: 0 };
    for (const fee of targets) {
      const outcome = await this.notifier.reminder(fee.id, input.kind, auth.userId);
      summary.parentsReached += outcome.reached;
      summary.parentsUnreachable += outcome.unreachable;
      if (outcome.alreadyReminded) summary.alreadyReminded += 1;
    }
    await this.audit.record({
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'finance.reminders.sent',
      module: 'finance',
      resourceType: 'FeeReminder',
      resourceId: auth.schoolId,
      metadata: { kind: input.kind, ...summary },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return summary;
  }

  /** Recent reminder activity, newest first — who was told what, and who couldn't be reached. */
  async reminderLog(auth: AuthContext, page: number, pageSize: number) {
    requireSchoolWide(auth);
    const where = { schoolId: auth.schoolId, kind: { in: ['DUE', 'OUTSTANDING', 'OVERDUE'] as ('DUE' | 'OUTSTANDING' | 'OVERDUE')[] } };
    const [total, rows] = await Promise.all([
      this.prisma.feeReminder.count({ where }),
      this.prisma.feeReminder.findMany({
        where,
        include: { studentFee: { include: { student: true, feeStructure: { include: { feeCategory: true } } } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        kind: r.kind,
        channel: r.channel,
        status: r.status,
        detail: r.detail,
        studentName: `${r.studentFee.student.firstName} ${r.studentFee.student.lastName}`.trim(),
        admissionNo: r.studentFee.student.admissionNo,
        feeCategory: r.studentFee.feeStructure.feeCategory.name,
      })),
      total,
      page,
      pageSize,
    };
  }

  // -- Dashboard -------------------------------------------------------------

  async dashboard(auth: AuthContext) {
    requireSchoolWide(auth);
    const schoolId = auth.schoolId;
    const school = await this.school(schoolId);
    const today = todayInTimezone(school.timezone);
    const monthStart = `${today.slice(0, 7)}-01`;
    const dayRange = localDayRange(school.timezone, today);
    const monthRange = localDayRange(school.timezone, monthStart);
    const trendFromIso = new Date(`${today}T00:00:00Z`);
    trendFromIso.setUTCDate(trendFromIso.getUTCDate() - 13);
    const trendStart = localDayRange(school.timezone, trendFromIso.toISOString().slice(0, 10)).start;

    const [todayAgg, monthAgg, allAgg, refundAgg, openFees, pendingRefunds, approvedRefunds, pendingConcessions, recent, trendRows, todayByMethod] = await Promise.all([
      this.prisma.payment.aggregate({ where: { schoolId, deletedAt: null, paidAt: { gte: dayRange.start, lte: dayRange.end } }, _sum: { amountMinor: true }, _count: true }),
      this.prisma.payment.aggregate({ where: { schoolId, deletedAt: null, paidAt: { gte: monthRange.start, lte: dayRange.end } }, _sum: { amountMinor: true } }),
      this.prisma.payment.aggregate({ where: { schoolId, deletedAt: null }, _sum: { amountMinor: true } }),
      this.prisma.refundRequest.aggregate({ where: { schoolId, status: 'PROCESSED' }, _sum: { amountMinor: true } }),
      this.prisma.studentFee.findMany({
        where: { schoolId, deletedAt: null, status: { in: [StudentFeeStatus.PENDING, StudentFeeStatus.PARTIALLY_PAID] }, student: { deletedAt: null } },
        include: { payments: { where: { deletedAt: null }, select: { amountMinor: true } }, refunds: { where: { status: 'PROCESSED' }, select: { amountMinor: true, status: true } } },
      }),
      this.prisma.refundRequest.aggregate({ where: { schoolId, status: 'REQUESTED' }, _sum: { amountMinor: true }, _count: true }),
      this.prisma.refundRequest.aggregate({ where: { schoolId, status: 'APPROVED' }, _sum: { amountMinor: true }, _count: true }),
      this.prisma.concession.count({ where: { schoolId, status: { in: ['REQUESTED', 'APPROVED'] } } }),
      this.prisma.payment.findMany({
        where: { schoolId, deletedAt: null },
        include: { receipt: true, studentFee: { include: { student: true, feeStructure: { include: { feeCategory: true } } } } },
        orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
        take: 8,
      }),
      this.prisma.payment.findMany({ where: { schoolId, deletedAt: null, paidAt: { gte: trendStart, lte: dayRange.end } }, select: { paidAt: true, amountMinor: true } }),
      this.prisma.payment.groupBy({ by: ['method'], where: { schoolId, deletedAt: null, paidAt: { gte: dayRange.start, lte: dayRange.end } }, _sum: { amountMinor: true }, _count: true }),
    ]);

    let outstandingMinor = 0;
    let overdueMinor = 0;
    let overdueFees = 0;
    let pendingFees = 0;
    let partialFees = 0;
    for (const fee of openFees) {
      const money = feeMoney(fee);
      if (money.balanceMinor === 0) continue;
      outstandingMinor += money.balanceMinor;
      if (fee.status === StudentFeeStatus.PENDING) pendingFees += 1;
      else partialFees += 1;
      if (fee.dueDate && dateOnlyToIso(fee.dueDate) < today) {
        overdueMinor += money.balanceMinor;
        overdueFees += 1;
      }
    }

    const byDay = new Map<string, number>();
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - i);
      byDay.set(d.toISOString().slice(0, 10), 0);
    }
    for (const p of trendRows) {
      const day = todayInTimezone(school.timezone, p.paidAt);
      if (byDay.has(day)) byDay.set(day, (byDay.get(day) ?? 0) + p.amountMinor);
    }

    const cashiers = new Map(
      (await this.prisma.user.findMany({ where: { id: { in: [...new Set(recent.map((r) => r.collectedById))] } }, select: { id: true, firstName: true, lastName: true } })).map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]),
    );

    const grossMinor = allAgg._sum.amountMinor ?? 0;
    const refundedMinor = refundAgg._sum.amountMinor ?? 0;
    return {
      today,
      collection: {
        todayMinor: todayAgg._sum.amountMinor ?? 0,
        todayCount: todayAgg._count,
        monthMinor: monthAgg._sum.amountMinor ?? 0,
        totalMinor: grossMinor - refundedMinor,
        refundedMinor,
        todayByMethod: todayByMethod.map((m) => ({ method: m.method, label: PAYMENT_METHOD_LABELS[m.method] ?? m.method, amountMinor: m._sum.amountMinor ?? 0, count: m._count })),
      },
      outstanding: { totalMinor: outstandingMinor, fees: pendingFees + partialFees },
      overdue: { totalMinor: overdueMinor, fees: overdueFees },
      pendingPayments: { pending: pendingFees, partiallyPaid: partialFees },
      refunds: {
        requested: pendingRefunds._count,
        requestedMinor: pendingRefunds._sum.amountMinor ?? 0,
        approvedToPayOut: approvedRefunds._count,
        approvedMinor: approvedRefunds._sum.amountMinor ?? 0,
      },
      pendingConcessions,
      // No payment gateway is connected, so there is nothing that can fail. Shown honestly, not as a zero.
      paymentFailures: { enabled: false, message: 'Online payments aren’t switched on, so there are no failed payments to show.' },
      recentTransactions: recent.map((p) => ({
        id: p.id,
        receiptId: p.receipt?.id ?? null,
        receiptNo: p.receipt?.receiptNo ?? null,
        paidAt: p.paidAt,
        amountMinor: p.amountMinor,
        method: p.method,
        collectedBy: cashiers.get(p.collectedById) ?? null,
        studentId: p.studentFee.studentId,
        studentName: `${p.studentFee.student.firstName} ${p.studentFee.student.lastName}`.trim(),
        feeCategory: p.studentFee.feeStructure.feeCategory.name,
      })),
      trend: [...byDay.entries()].map(([date, amountMinor]) => ({ date, amountMinor })),
    };
  }
}
