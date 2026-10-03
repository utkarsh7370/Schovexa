import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, RefundStatus } from '@prisma/client';
import type { CreateRefundInput } from '@schovexa/validation';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../authorization/authorization.types';
import { buildPaginationMeta } from '../common/pagination.util';
import { schoolDateRange } from '../finance/date-range';
import { recomputeFeeStatus } from '../finance/fee-math';
import { formatMoney } from '../finance/money';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';

interface Meta {
  ipAddress: string | null;
  userAgent: string | null;
}

const INCLUDE = {
  payment: { include: { receipt: true } },
  studentFee: { include: { feeStructure: { include: { feeCategory: true } } } },
  student: { include: { section: { include: { class: true } } } },
} satisfies Prisma.RefundRequestInclude;

type Row = Prisma.RefundRequestGetPayload<{ include: typeof INCLUDE }>;

const STATUSES: RefundStatus[] = ['REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSED'];

// Refunds, with the work split between people on purpose:
//   accountant requests  →  Principal / Director approves (or rejects)  →  accountant pays it out
// Nobody can approve their own request, and nothing is paid out unapproved.
// Refunds go back the way the money came: cash, today.
@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private async names(ids: (string | null)[]): Promise<Map<string, string>> {
    const real = [...new Set(ids.filter((i): i is string => !!i))];
    const users = await this.prisma.user.findMany({ where: { id: { in: real } }, select: { id: true, firstName: true, lastName: true } });
    return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  }

  private toRow(r: Row, names: Map<string, string>) {
    const who = (id: string | null) => (id ? (names.get(id) ?? null) : null);
    return {
      id: r.id,
      status: r.status,
      amountMinor: r.amountMinor,
      reason: r.reason,
      method: r.method,
      createdAt: r.createdAt,
      requestedBy: who(r.requestedById),
      requestedById: r.requestedById,
      decidedBy: who(r.decidedById),
      decidedAt: r.decidedAt,
      decisionNote: r.decisionNote,
      processedBy: who(r.processedById),
      processedAt: r.processedAt,
      payment: { id: r.paymentId, receiptNo: r.payment.receipt?.receiptNo ?? null, receiptId: r.payment.receipt?.id ?? null, amountMinor: r.payment.amountMinor, paidAt: r.payment.paidAt },
      feeCategory: r.studentFee.feeStructure.feeCategory.name,
      studentFeeId: r.studentFeeId,
      student: {
        id: r.student.id,
        admissionNo: r.student.admissionNo,
        name: `${r.student.firstName} ${r.student.lastName}`.trim(),
        className: r.student.section?.class.name ?? null,
        sectionName: r.student.section?.name ?? null,
      },
    };
  }

  private async one(auth: AuthContext, id: string): Promise<Row> {
    const row = await this.prisma.refundRequest.findFirst({ where: { id, schoolId: auth.schoolId }, include: INCLUDE });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    return row;
  }

  async list(auth: AuthContext, filters: { status?: string; search?: string; studentId?: string; from?: string; to?: string }, page: number, pageSize: number) {
    PaymentsService.requireSchoolWide(auth);
    const terms = (filters.search ?? '').trim().split(/\s+/).filter(Boolean);
    const created = await schoolDateRange(this.prisma, auth.schoolId, filters.from, filters.to);
    const where: Prisma.RefundRequestWhereInput = {
      schoolId: auth.schoolId,
      ...(filters.status && (STATUSES as string[]).includes(filters.status) ? { status: filters.status as RefundStatus } : {}),
      ...(filters.studentId ? { studentId: filters.studentId } : {}),
      ...(Object.keys(created).length ? { createdAt: created } : {}),
      ...(terms.length
        ? {
            AND: terms.map((t) => {
              const contains = { contains: t, mode: 'insensitive' as const };
              return { OR: [{ reason: contains }, { student: { firstName: contains } }, { student: { lastName: contains } }, { student: { admissionNo: contains } }, { payment: { receipt: { receiptNo: contains } } }] };
            }),
          }
        : {}),
    };
    const [total, rows, counts] = await Promise.all([
      this.prisma.refundRequest.count({ where }),
      this.prisma.refundRequest.findMany({ where, include: INCLUDE, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.refundRequest.groupBy({ by: ['status'], where: { schoolId: auth.schoolId }, _count: { _all: true } }),
    ]);
    const names = await this.names(rows.flatMap((r) => [r.requestedById, r.decidedById, r.processedById]));
    return {
      data: rows.map((r) => this.toRow(r, names)),
      pagination: buildPaginationMeta(page, pageSize, total),
      counts: Object.fromEntries(STATUSES.map((s) => [s, counts.find((c) => c.status === s)?._count._all ?? 0])),
    };
  }

  /** What is still refundable on a payment: its amount, less refunds paid out or in progress. */
  private async refundable(paymentId: string, ignoreRefundId?: string): Promise<{ payment: Prisma.PaymentGetPayload<Record<string, never>>; left: number }> {
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const others = await this.prisma.refundRequest.aggregate({
      where: { paymentId, status: { in: ['REQUESTED', 'APPROVED', 'PROCESSED'] }, ...(ignoreRefundId ? { id: { not: ignoreRefundId } } : {}) },
      _sum: { amountMinor: true },
    });
    return { payment, left: payment.amountMinor - (others._sum.amountMinor ?? 0) };
  }

  async create(auth: AuthContext, input: CreateRefundInput, meta: Meta) {
    PaymentsService.requireSchoolWide(auth);
    const payment = await this.prisma.payment.findFirst({ where: { id: input.paymentId, schoolId: auth.schoolId, deletedAt: null }, include: { studentFee: true } });
    if (!payment) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    const { left } = await this.refundable(payment.id);
    if (input.amountMinor > left) {
      throw new BadRequestException({
        code: 'REFUND_EXCEEDS_PAYMENT',
        message: left > 0 ? `At most ${formatMoney(left)} can still be refunded on this payment.` : 'This payment has already been fully refunded, or a refund for all of it is waiting.',
        details: [{ field: 'amountMinor', message: `At most ${formatMoney(Math.max(left, 0))}.` }],
      });
    }
    const created = await this.prisma.refundRequest.create({
      data: {
        schoolId: auth.schoolId,
        paymentId: payment.id,
        studentFeeId: payment.studentFeeId,
        studentId: payment.studentFee.studentId,
        amountMinor: input.amountMinor,
        reason: input.reason,
        method: payment.method,
        requestedById: auth.userId,
      },
      include: INCLUDE,
    });
    await this.record(auth, 'refund.requested', created.id, { amountMinor: created.amountMinor, reason: created.reason, studentId: created.studentId, receiptNo: created.payment.receipt?.receiptNo ?? null }, meta);

    const approvers = (await this.notifications.usersWithPermission(auth.schoolId, 'refund.approve')).filter((u) => u.id !== auth.userId);
    await this.notifications.notify({
      schoolId: auth.schoolId,
      userIds: approvers.map((u) => u.id),
      title: `Refund request: ${formatMoney(created.amountMinor)} for ${created.student.firstName} ${created.student.lastName}`,
      body: `${(await this.names([auth.userId])).get(auth.userId) ?? 'The accountant'} asked for a refund. Reason: ${created.reason}`,
      link: '/dashboard/finance/refunds',
    });
    return this.toRow(created, await this.names([created.requestedById]));
  }

  async approve(auth: AuthContext, id: string, note: string | undefined, meta: Meta) {
    PaymentsService.requireSchoolWide(auth);
    const row = await this.one(auth, id);
    this.assertStatus(row, 'REQUESTED', 'Only a waiting request can be approved.');
    if (row.requestedById === auth.userId) {
      throw new ForbiddenException({ code: 'CANNOT_APPROVE_OWN', message: 'You can’t approve a refund you asked for — someone else has to.' });
    }
    const { left } = await this.refundable(row.paymentId, row.id);
    if (row.amountMinor > left) throw new ConflictException({ code: 'REFUND_EXCEEDS_PAYMENT', message: 'This is more than can still be refunded on the payment.' });
    const updated = await this.prisma.refundRequest.update({ where: { id }, data: { status: 'APPROVED', decidedById: auth.userId, decidedAt: new Date(), decisionNote: note || null }, include: INCLUDE });
    await this.record(auth, 'refund.approved', id, { amountMinor: row.amountMinor, note: note ?? null }, meta);
    await this.notifications.notify({ schoolId: auth.schoolId, userIds: [row.requestedById], title: 'Refund approved', body: `Your refund request for ${formatMoney(row.amountMinor)} (${row.student.firstName} ${row.student.lastName}) was approved. You can pay it out now.`, link: '/dashboard/finance/refunds' });
    return this.toRow(updated, await this.names([updated.requestedById, updated.decidedById]));
  }

  async reject(auth: AuthContext, id: string, note: string, meta: Meta) {
    PaymentsService.requireSchoolWide(auth);
    const row = await this.one(auth, id);
    this.assertStatus(row, 'REQUESTED', 'Only a waiting request can be rejected.');
    if (row.requestedById === auth.userId) {
      throw new ForbiddenException({ code: 'CANNOT_APPROVE_OWN', message: 'You can’t decide a refund you asked for — someone else has to. (You can withdraw it instead.)' });
    }
    const updated = await this.prisma.refundRequest.update({ where: { id }, data: { status: 'REJECTED', decidedById: auth.userId, decidedAt: new Date(), decisionNote: note }, include: INCLUDE });
    await this.record(auth, 'refund.rejected', id, { amountMinor: row.amountMinor, note }, meta);
    await this.notifications.notify({ schoolId: auth.schoolId, userIds: [row.requestedById], title: 'Refund rejected', body: `Your refund request for ${formatMoney(row.amountMinor)} (${row.student.firstName} ${row.student.lastName}) was rejected: ${note}`, link: '/dashboard/finance/refunds' });
    return this.toRow(updated, await this.names([updated.requestedById, updated.decidedById]));
  }

  /** The requester takes their own request back, while nobody has decided it yet. */
  async withdraw(auth: AuthContext, id: string, meta: Meta) {
    PaymentsService.requireSchoolWide(auth);
    const row = await this.one(auth, id);
    this.assertStatus(row, 'REQUESTED', 'Only a waiting request can be withdrawn.');
    if (row.requestedById !== auth.userId) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the person who asked can withdraw a request.' });
    const updated = await this.prisma.refundRequest.update({ where: { id }, data: { status: 'REJECTED', decidedById: auth.userId, decidedAt: new Date(), decisionNote: 'Withdrawn by the requester' }, include: INCLUDE });
    await this.record(auth, 'refund.withdrawn', id, { amountMinor: row.amountMinor }, meta);
    return this.toRow(updated, await this.names([updated.requestedById, updated.decidedById]));
  }

  /** Pays out an approved refund: the fee's balance goes back up, and it is recorded. */
  async process(auth: AuthContext, id: string, meta: Meta) {
    PaymentsService.requireSchoolWide(auth);
    const row = await this.one(auth, id);
    this.assertStatus(row, 'APPROVED', row.status === 'REQUESTED' ? 'This refund hasn’t been approved yet.' : 'Only an approved refund can be paid out.');
    const { left } = await this.refundable(row.paymentId, row.id);
    if (row.amountMinor > left) throw new ConflictException({ code: 'REFUND_EXCEEDS_PAYMENT', message: 'This is more than can still be refunded on the payment.' });
    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.refundRequest.update({ where: { id, status: 'APPROVED' }, data: { status: 'PROCESSED', processedById: auth.userId, processedAt: new Date() }, include: INCLUDE });
      await recomputeFeeStatus(tx, row.studentFeeId);
      return r;
    });
    await this.record(auth, 'refund.processed', id, { amountMinor: row.amountMinor, method: row.method, studentId: row.studentId, receiptNo: row.payment.receipt?.receiptNo ?? null }, meta);
    return this.toRow(updated, await this.names([updated.requestedById, updated.decidedById, updated.processedById]));
  }

  private assertStatus(row: Row, expected: RefundStatus, message: string) {
    if (row.status !== expected) throw new ConflictException({ code: 'WRONG_STATUS', message });
  }

  private record(auth: AuthContext, action: string, id: string, metadata: Prisma.InputJsonValue, meta: Meta) {
    return this.audit.record({ schoolId: auth.schoolId, userId: auth.userId, action, module: 'refund', resourceType: 'RefundRequest', resourceId: id, metadata, ipAddress: meta.ipAddress, userAgent: meta.userAgent });
  }
}
