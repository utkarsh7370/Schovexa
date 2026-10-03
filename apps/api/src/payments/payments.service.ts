import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PaymentMethod, Prisma } from '@prisma/client';
import type { CorrectPaymentInput } from '@schovexa/validation';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../authorization/authorization.types';
import { AuthorizationService } from '../authorization/authorization.service';
import { buildPaginationMeta } from '../common/pagination.util';
import { dateOnlyToIso } from '../common/dates.util';
import { schoolDateRange } from '../finance/date-range';
import { feeMoney, recomputeFeeStatus } from '../finance/fee-math';
import { formatMoney } from '../finance/money';
import { PAYMENT_METHOD_LABELS } from '../finance/payment-methods';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolSettingsService } from '../school-settings/school-settings.service';

export interface TransactionFilters {
  search?: string;
  from?: string;
  to?: string;
  method?: string;
  classId?: string;
  sectionId?: string;
  studentId?: string;
}

const PAYMENT_INCLUDE = {
  receipt: true,
  refunds: true,
  studentFee: {
    include: {
      student: { include: { section: { include: { class: true } } } },
      feeStructure: { include: { feeCategory: true } },
      payments: { where: { deletedAt: null } },
      refunds: { where: { status: 'PROCESSED' as const } },
    },
  },
} satisfies Prisma.PaymentInclude;

export type PaymentWithRelations = Prisma.PaymentGetPayload<{ include: typeof PAYMENT_INCLUDE }>;

const words = (value: string | undefined) => (value ?? '').trim().split(/\s+/).filter(Boolean);

// The transactions list: every payment the school has recorded, with who took it
// and what has happened to it since (corrected, refunded). School-wide by nature,
// so it needs ALL_SCHOOL scope — a parent's own-children scope never reaches it.
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authorization: AuthorizationService,
    private readonly settings: SchoolSettingsService,
  ) {}

  static requireSchoolWide(auth: AuthContext): void {
    if (auth.scope !== 'ALL_SCHOOL') throw new ForbiddenException({ code: 'FORBIDDEN', message: 'This needs school-wide finance access.' });
  }

  /** A school-local date range → real instants, for filtering on paidAt. */
  dateRange(schoolId: string, from?: string, to?: string): Promise<{ gte?: Date; lte?: Date }> {
    return schoolDateRange(this.prisma, schoolId, from, to);
  }

  async whereFor(schoolId: string, filters: TransactionFilters): Promise<Prisma.PaymentWhereInput> {
    const range = await this.dateRange(schoolId, filters.from, filters.to);
    const terms = words(filters.search);
    const method = filters.method && ['CASH', 'CHEQUE', 'BANK_TRANSFER', 'ONLINE'].includes(filters.method) ? (filters.method as PaymentMethod) : undefined;
    return {
      schoolId,
      deletedAt: null,
      ...(Object.keys(range).length ? { paidAt: range } : {}),
      ...(method ? { method } : {}),
      studentFee: {
        ...(filters.studentId ? { studentId: filters.studentId } : {}),
        student: {
          ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
          ...(filters.classId ? { section: { classId: filters.classId } } : {}),
        },
      },
      ...(terms.length
        ? {
            AND: terms.map((term) => {
              const contains = { contains: term, mode: 'insensitive' as const };
              return {
                OR: [
                  { receipt: { receiptNo: contains } },
                  { reference: contains },
                  { studentFee: { student: { firstName: contains } } },
                  { studentFee: { student: { lastName: contains } } },
                  { studentFee: { student: { admissionNo: contains } } },
                ],
              };
            }),
          }
        : {}),
    };
  }

  private async cashierNames(ids: string[]): Promise<Map<string, string>> {
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, firstName: true, lastName: true } });
    return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  }

  toRow(p: PaymentWithRelations, cashiers: Map<string, string>) {
    const fee = p.studentFee;
    const processed = p.refunds.filter((r) => r.status === 'PROCESSED').reduce((n, r) => n + r.amountMinor, 0);
    const open = p.refunds.filter((r) => r.status === 'REQUESTED' || r.status === 'APPROVED').reduce((n, r) => n + r.amountMinor, 0);
    return {
      id: p.id,
      receiptId: p.receipt?.id ?? null,
      receiptNo: p.receipt?.receiptNo ?? null,
      paidAt: p.paidAt,
      amountMinor: p.amountMinor,
      method: p.method,
      methodLabel: PAYMENT_METHOD_LABELS[p.method] ?? p.method,
      reference: p.reference,
      receivedFrom: p.receivedFrom,
      note: p.note,
      collectedBy: cashiers.get(p.collectedById) ?? null,
      corrected: !!p.correctedAt,
      correctionReason: p.correctionReason,
      refundedMinor: processed,
      refundableMinor: Math.max(p.amountMinor - processed - open, 0),
      hasOpenRefund: open > 0,
      studentFeeId: fee.id,
      feeCategory: fee.feeStructure.feeCategory.name,
      student: {
        id: fee.student.id,
        admissionNo: fee.student.admissionNo,
        name: `${fee.student.firstName} ${fee.student.lastName}`.trim(),
        className: fee.student.section?.class.name ?? null,
        sectionName: fee.student.section?.name ?? null,
      },
    };
  }

  async list(auth: AuthContext, filters: TransactionFilters, page: number, pageSize: number) {
    PaymentsService.requireSchoolWide(auth);
    const where = await this.whereFor(auth.schoolId, filters);
    const [total, rows, sum] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({ where, include: PAYMENT_INCLUDE, orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.payment.aggregate({ where, _sum: { amountMinor: true } }),
    ]);
    const cashiers = await this.cashierNames(rows.map((r) => r.collectedById));
    return { data: rows.map((r) => this.toRow(r, cashiers)), pagination: buildPaginationMeta(page, pageSize, total), totalMinor: sum._sum.amountMinor ?? 0 };
  }

  async allRows(auth: AuthContext, filters: TransactionFilters) {
    PaymentsService.requireSchoolWide(auth);
    const rows = await this.prisma.payment.findMany({ where: await this.whereFor(auth.schoolId, filters), include: PAYMENT_INCLUDE, orderBy: [{ paidAt: 'desc' }], take: 20_000 });
    const cashiers = await this.cashierNames(rows.map((r) => r.collectedById));
    return rows.map((r) => this.toRow(r, cashiers));
  }

  async detail(auth: AuthContext, id: string) {
    PaymentsService.requireSchoolWide(auth);
    const payment = await this.prisma.payment.findFirst({ where: { id, schoolId: auth.schoolId, deletedAt: null }, include: PAYMENT_INCLUDE });
    if (!payment) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    return this.toRow(payment, await this.cashierNames([payment.collectedById]));
  }

  /**
   * Correct a payment that was entered wrongly (wrong amount or date, a typo in a
   * reference). A reason is mandatory, the old values are kept in the audit log,
   * and — unless the person holds payment.correctAny — it only works for a few
   * days after the payment was recorded (the school's "correction window").
   */
  async correct(auth: AuthContext, id: string, input: CorrectPaymentInput, meta: { ipAddress: string | null; userAgent: string | null }) {
    PaymentsService.requireSchoolWide(auth);
    const payment = await this.prisma.payment.findFirst({ where: { id, schoolId: auth.schoolId, deletedAt: null }, include: PAYMENT_INCLUDE });
    if (!payment) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });

    const settings = await this.settings.get(auth.schoolId);
    const unlimited = !!(await this.authorization.getGrant(auth.roleId, 'payment.correctAny'));
    const ageMs = Date.now() - payment.createdAt.getTime();
    if (!unlimited && ageMs > settings.paymentCorrectionWindowDays * 86_400_000) {
      throw new ForbiddenException({
        code: 'CORRECTION_WINDOW_PASSED',
        message: `A payment can be corrected for ${settings.paymentCorrectionWindowDays} day${settings.paymentCorrectionWindowDays === 1 ? '' : 's'} after it is recorded. Ask the Principal or Director to correct this one.`,
      });
    }
    if (payment.refunds.some((r) => r.status !== 'REJECTED') && input.amountMinor !== undefined && input.amountMinor !== payment.amountMinor) {
      throw new BadRequestException({ code: 'PAYMENT_HAS_REFUNDS', message: 'This payment has a refund against it, so its amount can’t be changed.' });
    }

    if (input.amountMinor !== undefined) {
      const fee = payment.studentFee;
      const gross = fee.payments.reduce((n, p) => n + p.amountMinor, 0) - payment.amountMinor + input.amountMinor;
      const refunded = fee.refunds.reduce((n, r) => n + r.amountMinor, 0);
      const net = feeMoney({ ...fee, payments: [{ amountMinor: gross }], refunds: fee.refunds }).netDueMinor;
      if (gross - refunded > net) {
        throw new BadRequestException({
          code: 'AMOUNT_EXCEEDS_BALANCE',
          message: `That would take the total paid above what is owed (${formatMoney(net)}).`,
          details: [{ field: 'amountMinor', message: 'Too high for this fee.' }],
        });
      }
    }

    const before = { amountMinor: payment.amountMinor, paidAt: dateOnlyToIso(payment.paidAt), receivedFrom: payment.receivedFrom, note: payment.note, reference: payment.reference };
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.payment.update({
        where: { id },
        data: {
          ...(input.amountMinor !== undefined ? { amountMinor: input.amountMinor } : {}),
          ...(input.paidAt ? { paidAt: new Date(input.paidAt) } : {}),
          ...(input.receivedFrom !== undefined ? { receivedFrom: input.receivedFrom || null } : {}),
          ...(input.note !== undefined ? { note: input.note || null } : {}),
          ...(input.reference !== undefined ? { reference: input.reference || null } : {}),
          correctedAt: new Date(),
          correctedById: auth.userId,
          correctionReason: input.reason,
        },
      });
      await recomputeFeeStatus(tx, payment.studentFeeId);
      return row;
    });

    await this.audit.record({
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'payment.corrected',
      module: 'payment',
      resourceType: 'Payment',
      resourceId: id,
      metadata: { reason: input.reason, before, after: { amountMinor: updated.amountMinor, paidAt: dateOnlyToIso(updated.paidAt), receivedFrom: updated.receivedFrom, note: updated.note, reference: updated.reference }, receiptNo: payment.receipt?.receiptNo ?? null },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return this.detail(auth, id);
  }
}
