import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ConcessionKind, ConcessionStatus, Prisma } from '@prisma/client';
import type { CreateConcessionInput } from '@schovexa/validation';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../authorization/authorization.types';
import { AuthorizationService } from '../authorization/authorization.service';
import { buildPaginationMeta } from '../common/pagination.util';
import { feeMoney, recomputeFeeStatus } from '../finance/fee-math';
import { formatMoney } from '../finance/money';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolSettingsService } from '../school-settings/school-settings.service';

interface Meta {
  ipAddress: string | null;
  userAgent: string | null;
}

const INCLUDE = {
  student: { include: { section: { include: { class: true } } } },
  studentFee: { include: { feeStructure: { include: { feeCategory: true } } } },
} satisfies Prisma.ConcessionInclude;

type Row = Prisma.ConcessionGetPayload<{ include: typeof INCLUDE }>;
const STATUSES: ConcessionStatus[] = ['REQUESTED', 'APPROVED', 'REJECTED', 'APPLIED'];
const KINDS: ConcessionKind[] = ['DISCOUNT', 'SCHOLARSHIP', 'CONCESSION'];

// Discounts, scholarships and concessions on a student's fee.
//   • A small discount (within the school's limit, a percentage of the fee) is
//     applied by the accountant straight away.
//   • Anything bigger — and every scholarship or concession — is requested, then
//     approved by the Principal or Director, then applied.
// Nobody approves their own request. A person who holds both approve and apply
// (the Director) can do it in one step.
@Injectable()
export class ConcessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly settings: SchoolSettingsService,
    private readonly authorization: AuthorizationService,
  ) {}

  private async names(ids: (string | null)[]): Promise<Map<string, string>> {
    const real = [...new Set(ids.filter((i): i is string => !!i))];
    const users = await this.prisma.user.findMany({ where: { id: { in: real } }, select: { id: true, firstName: true, lastName: true } });
    return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  }

  private toRow(c: Row, names: Map<string, string>) {
    const who = (id: string | null) => (id ? (names.get(id) ?? null) : null);
    return {
      id: c.id,
      kind: c.kind,
      name: c.name,
      status: c.status,
      amountMinor: c.amountMinor,
      reason: c.reason,
      createdAt: c.createdAt,
      requestedBy: who(c.requestedById),
      requestedById: c.requestedById,
      decidedBy: who(c.decidedById),
      decidedAt: c.decidedAt,
      decisionNote: c.decisionNote,
      appliedBy: who(c.appliedById),
      appliedAt: c.appliedAt,
      studentFeeId: c.studentFeeId,
      feeCategory: c.studentFee.feeStructure.feeCategory.name,
      feeAmountMinor: c.studentFee.amountDueMinor,
      student: {
        id: c.student.id,
        admissionNo: c.student.admissionNo,
        name: `${c.student.firstName} ${c.student.lastName}`.trim(),
        className: c.student.section?.class.name ?? null,
        sectionName: c.student.section?.name ?? null,
      },
    };
  }

  private async one(auth: AuthContext, id: string): Promise<Row> {
    const row = await this.prisma.concession.findFirst({ where: { id, schoolId: auth.schoolId }, include: INCLUDE });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    return row;
  }

  async list(auth: AuthContext, filters: { status?: string; kind?: string; search?: string; studentId?: string }, page: number, pageSize: number) {
    PaymentsService.requireSchoolWide(auth);
    const terms = (filters.search ?? '').trim().split(/\s+/).filter(Boolean);
    const where: Prisma.ConcessionWhereInput = {
      schoolId: auth.schoolId,
      ...(filters.status && (STATUSES as string[]).includes(filters.status) ? { status: filters.status as ConcessionStatus } : {}),
      ...(filters.kind && (KINDS as string[]).includes(filters.kind) ? { kind: filters.kind as ConcessionKind } : {}),
      ...(filters.studentId ? { studentId: filters.studentId } : {}),
      ...(terms.length
        ? { AND: terms.map((t) => {
            const contains = { contains: t, mode: 'insensitive' as const };
            return { OR: [{ name: contains }, { reason: contains }, { student: { firstName: contains } }, { student: { lastName: contains } }, { student: { admissionNo: contains } }] };
          }) }
        : {}),
    };
    const [total, rows, counts] = await Promise.all([
      this.prisma.concession.count({ where }),
      this.prisma.concession.findMany({ where, include: INCLUDE, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.concession.groupBy({ by: ['status'], where: { schoolId: auth.schoolId }, _count: { _all: true } }),
    ]);
    const names = await this.names(rows.flatMap((r) => [r.requestedById, r.decidedById, r.appliedById]));
    const settings = await this.settings.get(auth.schoolId);
    return {
      data: rows.map((r) => this.toRow(r, names)),
      pagination: buildPaginationMeta(page, pageSize, total),
      counts: Object.fromEntries(STATUSES.map((s) => [s, counts.find((c) => c.status === s)?._count._all ?? 0])),
      maxDiscountPercent: settings.maxDiscountPercent,
    };
  }

  async create(auth: AuthContext, input: CreateConcessionInput, meta: Meta) {
    PaymentsService.requireSchoolWide(auth);
    const kind = (input.kind ?? 'DISCOUNT') as ConcessionKind;
    const fee = await this.prisma.studentFee.findFirst({
      where: { id: input.studentFeeId, schoolId: auth.schoolId, deletedAt: null },
      include: { payments: { where: { deletedAt: null } }, refunds: { where: { status: 'PROCESSED' } }, student: true },
    });
    if (!fee) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    if (fee.status === 'WAIVED' || fee.status === 'PAID') {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: fee.status === 'PAID' ? 'This fee is already paid in full.' : 'This fee has been waived.' });
    }
    const money = feeMoney(fee);
    // A concession can't be worth more than what is still owed.
    if (input.amountMinor > money.balanceMinor) {
      throw new BadRequestException({
        code: 'CONCESSION_EXCEEDS_BALANCE',
        message: `That is more than the outstanding balance (${formatMoney(money.balanceMinor)}).`,
        details: [{ field: 'amountMinor', message: `At most ${formatMoney(money.balanceMinor)}.` }],
      });
    }

    const settings = await this.settings.get(auth.schoolId);
    const canApply = !!(await this.authorization.getGrant(auth.roleId, 'discount.apply'));
    const canApprove = !!(await this.authorization.getGrant(auth.roleId, 'discount.approve'));
    // The most this person may take off without anyone else signing it off.
    // Small discounts add up: the limit is for everything already given as a plain discount on this fee, not per entry.
    const limitMinor = Math.floor((fee.amountDueMinor * settings.maxDiscountPercent) / 100);
    const alreadyGiven = await this.prisma.concession.aggregate({ where: { studentFeeId: fee.id, kind: 'DISCOUNT', status: 'APPLIED' }, _sum: { amountMinor: true } });
    const withinLimit = kind === 'DISCOUNT' && (alreadyGiven._sum.amountMinor ?? 0) + input.amountMinor <= limitMinor;

    let status: ConcessionStatus = 'REQUESTED';
    if (canApprove && canApply) status = 'APPLIED'; // the Director's one-step path
    else if (canApply && withinLimit) status = 'APPLIED'; // a small discount, straight away
    else if (canApprove) status = 'APPROVED';

    const now = new Date();
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.concession.create({
        data: {
          schoolId: auth.schoolId,
          studentId: fee.studentId,
          studentFeeId: fee.id,
          kind,
          name: input.name,
          amountMinor: input.amountMinor,
          reason: input.reason,
          status,
          requestedById: auth.userId,
          ...(status === 'APPROVED' || status === 'APPLIED' ? (canApprove ? { decidedById: auth.userId, decidedAt: now, decisionNote: 'Approved on entry' } : { decisionNote: `Within the school’s ${settings.maxDiscountPercent}% limit` }) : {}),
          ...(status === 'APPLIED' ? { appliedById: auth.userId, appliedAt: now } : {}),
        },
        include: INCLUDE,
      });
      if (status === 'APPLIED') {
        await tx.studentFee.update({ where: { id: fee.id }, data: { discountMinor: { increment: input.amountMinor } } });
        await recomputeFeeStatus(tx, fee.id);
      }
      return row;
    });
    await this.record(auth, status === 'APPLIED' ? 'concession.applied' : status === 'APPROVED' ? 'concession.approved' : 'concession.requested', created.id, { kind, name: input.name, amountMinor: input.amountMinor, reason: input.reason, studentId: fee.studentId, direct: status === 'APPLIED' }, meta);

    if (status === 'REQUESTED') {
      const approvers = (await this.notifications.usersWithPermission(auth.schoolId, 'discount.approve')).filter((u) => u.id !== auth.userId);
      await this.notifications.notify({
        schoolId: auth.schoolId,
        userIds: approvers.map((u) => u.id),
        title: `${kind === 'SCHOLARSHIP' ? 'Scholarship' : kind === 'CONCESSION' ? 'Concession' : 'Discount'} request: ${formatMoney(input.amountMinor)} for ${fee.student.firstName} ${fee.student.lastName}`,
        body: `${input.name}. Reason: ${input.reason}`,
        link: '/dashboard/finance/concessions',
      });
    }
    return { ...this.toRow(created, await this.names([created.requestedById, created.decidedById, created.appliedById])), limitMinor };
  }

  async approve(auth: AuthContext, id: string, note: string | undefined, meta: Meta) {
    PaymentsService.requireSchoolWide(auth);
    const row = await this.one(auth, id);
    this.assertStatus(row, 'REQUESTED', 'Only a waiting request can be approved.');
    if (row.requestedById === auth.userId) throw new ForbiddenException({ code: 'CANNOT_APPROVE_OWN', message: 'You can’t approve a request you made — someone else has to.' });
    const updated = await this.prisma.concession.update({ where: { id }, data: { status: 'APPROVED', decidedById: auth.userId, decidedAt: new Date(), decisionNote: note || null }, include: INCLUDE });
    await this.record(auth, 'concession.approved', id, { amountMinor: row.amountMinor, note: note ?? null }, meta);
    await this.notifications.notify({ schoolId: auth.schoolId, userIds: [row.requestedById], title: `${row.name} approved`, body: `${formatMoney(row.amountMinor)} for ${row.student.firstName} ${row.student.lastName} is approved. You can apply it to the fee now.`, link: '/dashboard/finance/concessions' });
    return this.toRow(updated, await this.names([updated.requestedById, updated.decidedById]));
  }

  async reject(auth: AuthContext, id: string, note: string, meta: Meta) {
    PaymentsService.requireSchoolWide(auth);
    const row = await this.one(auth, id);
    this.assertStatus(row, 'REQUESTED', 'Only a waiting request can be rejected.');
    if (row.requestedById === auth.userId) throw new ForbiddenException({ code: 'CANNOT_APPROVE_OWN', message: 'You can’t decide a request you made — someone else has to.' });
    const updated = await this.prisma.concession.update({ where: { id }, data: { status: 'REJECTED', decidedById: auth.userId, decidedAt: new Date(), decisionNote: note }, include: INCLUDE });
    await this.record(auth, 'concession.rejected', id, { amountMinor: row.amountMinor, note }, meta);
    await this.notifications.notify({ schoolId: auth.schoolId, userIds: [row.requestedById], title: `${row.name} rejected`, body: `Your request for ${formatMoney(row.amountMinor)} (${row.student.firstName} ${row.student.lastName}) was rejected: ${note}`, link: '/dashboard/finance/concessions' });
    return this.toRow(updated, await this.names([updated.requestedById, updated.decidedById]));
  }

  /** Puts an approved concession onto the fee: the family now owes less. */
  async apply(auth: AuthContext, id: string, meta: Meta) {
    PaymentsService.requireSchoolWide(auth);
    const row = await this.one(auth, id);
    this.assertStatus(row, 'APPROVED', row.status === 'REQUESTED' ? 'This hasn’t been approved yet.' : 'Only an approved request can be applied.');
    const fee = await this.prisma.studentFee.findUniqueOrThrow({ where: { id: row.studentFeeId }, include: { payments: { where: { deletedAt: null } }, refunds: { where: { status: 'PROCESSED' } } } });
    const money = feeMoney(fee);
    if (fee.status === 'WAIVED' || row.amountMinor > money.balanceMinor) {
      throw new ConflictException({ code: 'CONCESSION_EXCEEDS_BALANCE', message: `The fee now has only ${formatMoney(money.balanceMinor)} outstanding, which is less than this ${formatMoney(row.amountMinor)} concession.` });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const c = await tx.concession.update({ where: { id, status: 'APPROVED' }, data: { status: 'APPLIED', appliedById: auth.userId, appliedAt: new Date() }, include: INCLUDE });
      await tx.studentFee.update({ where: { id: row.studentFeeId }, data: { discountMinor: { increment: row.amountMinor } } });
      await recomputeFeeStatus(tx, row.studentFeeId);
      return c;
    });
    await this.record(auth, 'concession.applied', id, { amountMinor: row.amountMinor, kind: row.kind, studentId: row.studentId, direct: false }, meta);
    return this.toRow(updated, await this.names([updated.requestedById, updated.decidedById, updated.appliedById]));
  }

  private assertStatus(row: Row, expected: ConcessionStatus, message: string) {
    if (row.status !== expected) throw new ConflictException({ code: 'WRONG_STATUS', message });
  }

  private record(auth: AuthContext, action: string, id: string, metadata: Prisma.InputJsonValue, meta: Meta) {
    return this.audit.record({ schoolId: auth.schoolId, userId: auth.userId, action, module: 'discount', resourceType: 'Concession', resourceId: id, metadata, ipAddress: meta.ipAddress, userAgent: meta.userAgent });
  }
}
