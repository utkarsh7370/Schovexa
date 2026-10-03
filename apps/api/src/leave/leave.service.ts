import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { LeaveKind, LeaveStatus, Prisma } from '@prisma/client';
import type { ApplyLeaveInput } from '@schovexa/validation';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../authorization/authorization.types';
import { dateOnlyToIso } from '../common/dates.util';
import { buildPaginationMeta } from '../common/pagination.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolSettingsService } from '../school-settings/school-settings.service';
import { AttachmentsService } from '../teaching/attachments.service';
import { SchoolClockService } from '../teaching/school-clock.service';

export const LEAVE_FILES = 'Leave';
const PAID: LeaveKind[] = ['CASUAL', 'SICK', 'EARNED'];

interface Meta {
  ipAddress: string | null;
  userAgent: string | null;
}

// Staff leave: apply → principal/admin decides → the applicant is told. Days are counted against the school's
// calendar (weekly offs and holidays don't use up leave), each paid type has a yearly allowance the school
// sets, and nobody decides their own request.
@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SchoolSettingsService,
    private readonly clock: SchoolClockService,
    private readonly notifications: NotificationsService,
    private readonly attachments: AttachmentsService,
    private readonly audit: AuditService,
  ) {}

  private toDto(l: Prisma.LeaveRequestGetPayload<Record<string, never>>, names: Map<string, string>, files = 0) {
    return {
      id: l.id,
      kind: l.kind,
      startDate: dateOnlyToIso(l.startDate),
      endDate: dateOnlyToIso(l.endDate),
      halfDay: l.halfDay,
      days: l.days,
      reason: l.reason,
      status: l.status,
      applicant: names.get(l.userId) ?? null,
      userId: l.userId,
      decidedBy: l.decidedById ? (names.get(l.decidedById) ?? null) : null,
      decidedAt: l.decidedAt,
      decisionNote: l.decisionNote,
      createdAt: l.createdAt,
      files,
    };
  }

  private async names(ids: (string | null)[]) {
    const real = [...new Set(ids.filter((i): i is string => !!i))];
    const users = await this.prisma.user.findMany({ where: { id: { in: real } }, select: { id: true, firstName: true, lastName: true } });
    return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  }

  /** This year's allowance, what is used (approved) and what is waiting (pending), per paid leave type. */
  async balances(schoolId: string, userId: string) {
    const year = (await this.clock.today(schoolId)).slice(0, 4);
    const [settings, rows] = await Promise.all([
      this.settings.get(schoolId),
      this.prisma.leaveRequest.findMany({ where: { schoolId, userId, status: { in: ['APPROVED', 'PENDING'] }, startDate: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) } }, select: { kind: true, days: true, status: true } }),
    ]);
    return PAID.map((kind) => {
      const allowance = settings.leaveAllowances[kind as 'CASUAL' | 'SICK' | 'EARNED'] ?? 0;
      const used = rows.filter((r) => r.kind === kind && r.status === 'APPROVED').reduce((n, r) => n + r.days, 0);
      const pending = rows.filter((r) => r.kind === kind && r.status === 'PENDING').reduce((n, r) => n + r.days, 0);
      return { kind, allowance, used, pending, remaining: Math.max(allowance - used - pending, 0) };
    });
  }

  async mine(auth: AuthContext) {
    const [rows, balances] = await Promise.all([this.prisma.leaveRequest.findMany({ where: { schoolId: auth.schoolId, userId: auth.userId }, orderBy: { startDate: 'desc' }, take: 100 }), this.balances(auth.schoolId, auth.userId)]);
    const [names, files] = await Promise.all([this.names([auth.userId, ...rows.map((r) => r.decidedById)]), this.attachments.counts(auth.schoolId, LEAVE_FILES, rows.map((r) => r.id))]);
    return { balances, requests: rows.map((r) => this.toDto(r, names, files.get(r.id) ?? 0)) };
  }

  async apply(auth: AuthContext, input: ApplyLeaveInput, meta: Meta) {
    const [statuses, mine] = await Promise.all([
      this.settings.dayStatuses(auth.schoolId, input.startDate, input.endDate),
      this.prisma.leaveRequest.findFirst({ where: { schoolId: auth.schoolId, userId: auth.userId, status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: new Date(input.endDate) }, endDate: { gte: new Date(input.startDate) } } }),
    ]);
    const working = statuses.filter((s) => s.working).length;
    if (working === 0) throw new BadRequestException({ code: 'NO_WORKING_DAYS', message: 'Those dates are all weekly offs or holidays — there is nothing to take leave for.' });
    if (mine) throw new ConflictException({ code: 'OVERLAPS', message: `You already have a ${mine.status.toLowerCase()} leave request covering ${dateOnlyToIso(mine.startDate)} to ${dateOnlyToIso(mine.endDate)}.` });
    const days = input.halfDay ? 0.5 : working;

    if (PAID.includes(input.kind)) {
      const balance = (await this.balances(auth.schoolId, auth.userId)).find((b) => b.kind === input.kind);
      if (balance && days > balance.remaining) {
        throw new BadRequestException({ code: 'LEAVE_BALANCE_EXCEEDED', message: `You have ${balance.remaining} ${input.kind.toLowerCase()} day${balance.remaining === 1 ? '' : 's'} left this year, and this asks for ${days}. Choose unpaid leave, or fewer days.` });
      }
    }
    const created = await this.prisma.leaveRequest.create({ data: { schoolId: auth.schoolId, userId: auth.userId, kind: input.kind, startDate: new Date(input.startDate), endDate: new Date(input.endDate), halfDay: !!input.halfDay, days, reason: input.reason } });
    await this.audit.record({ schoolId: auth.schoolId, userId: auth.userId, action: 'leave.requested', module: 'leave', resourceType: 'LeaveRequest', resourceId: created.id, metadata: { kind: input.kind, from: input.startDate, to: input.endDate, days }, ...meta });
    const who = (await this.names([auth.userId])).get(auth.userId) ?? 'Someone';
    const approvers = (await this.notifications.usersWithPermission(auth.schoolId, 'leave.approve')).filter((u) => u.id !== auth.userId);
    await this.notifications.notify({ schoolId: auth.schoolId, userIds: approvers.map((u) => u.id), title: `Leave request: ${who}`, body: `${input.kind.toLowerCase()} · ${input.startDate}${input.endDate !== input.startDate ? ` to ${input.endDate}` : ''} (${days} day${days === 1 ? '' : 's'}). ${input.reason}`, link: '/dashboard/leave?tab=requests' });
    return this.toDto(created, await this.names([auth.userId]));
  }

  async cancel(auth: AuthContext, id: string) {
    const row = await this.prisma.leaveRequest.findFirst({ where: { id, schoolId: auth.schoolId, userId: auth.userId } });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    const today = await this.clock.today(auth.schoolId);
    const cancellable = row.status === 'PENDING' || (row.status === 'APPROVED' && dateOnlyToIso(row.startDate) > today);
    if (!cancellable) throw new ConflictException({ code: 'WRONG_STATUS', message: 'This request can’t be cancelled any more.' });
    await this.prisma.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
    return { id };
  }

  async list(auth: AuthContext, f: { status?: string; search?: string }, page: number, pageSize: number) {
    const words = (f.search ?? '').trim().split(/\s+/).filter(Boolean);
    const userIds = words.length ? (await this.prisma.user.findMany({ where: { AND: words.map((w) => ({ OR: [{ firstName: { contains: w, mode: 'insensitive' as const } }, { lastName: { contains: w, mode: 'insensitive' as const } }] })), memberships: { some: { schoolId: auth.schoolId } } }, select: { id: true } })).map((u) => u.id) : undefined;
    const where: Prisma.LeaveRequestWhereInput = { schoolId: auth.schoolId, ...(f.status && ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(f.status) ? { status: f.status as LeaveStatus } : {}), ...(userIds ? { userId: { in: userIds } } : {}) };
    const [total, rows, counts] = await Promise.all([
      this.prisma.leaveRequest.count({ where }),
      this.prisma.leaveRequest.findMany({ where, orderBy: [{ status: 'asc' }, { startDate: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.leaveRequest.groupBy({ by: ['status'], where: { schoolId: auth.schoolId }, _count: { _all: true } }),
    ]);
    const [names, files] = await Promise.all([this.names(rows.flatMap((r) => [r.userId, r.decidedById])), this.attachments.counts(auth.schoolId, LEAVE_FILES, rows.map((r) => r.id))]);
    return { data: rows.map((r) => this.toDto(r, names, files.get(r.id) ?? 0)), pagination: buildPaginationMeta(page, pageSize, total), counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) };
  }

  private async decidable(auth: AuthContext, id: string) {
    const row = await this.prisma.leaveRequest.findFirst({ where: { id, schoolId: auth.schoolId } });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    if (row.status !== 'PENDING') throw new ConflictException({ code: 'WRONG_STATUS', message: 'This request has already been decided.' });
    if (row.userId === auth.userId) throw new ForbiddenException({ code: 'CANNOT_APPROVE_OWN', message: 'You can’t decide your own leave — someone else has to.' });
    return row;
  }

  async decide(auth: AuthContext, id: string, approve: boolean, note: string | undefined, meta: Meta) {
    const row = await this.decidable(auth, id);
    const updated = await this.prisma.leaveRequest.update({ where: { id }, data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: auth.userId, decidedAt: new Date(), decisionNote: note || null } });
    await this.audit.record({ schoolId: auth.schoolId, userId: auth.userId, action: approve ? 'leave.approved' : 'leave.rejected', module: 'leave', resourceType: 'LeaveRequest', resourceId: id, metadata: { applicant: row.userId, from: dateOnlyToIso(row.startDate), to: dateOnlyToIso(row.endDate), note: note ?? null }, ...meta });
    await this.notifications.notify({ schoolId: auth.schoolId, userIds: [row.userId], title: approve ? 'Leave approved' : 'Leave rejected', body: `${dateOnlyToIso(row.startDate)}${row.endDate.getTime() !== row.startDate.getTime() ? ` to ${dateOnlyToIso(row.endDate)}` : ''}${note ? ` — ${note}` : ''}`, link: '/dashboard/leave' });
    return this.toDto(updated, await this.names([row.userId, auth.userId]));
  }

  // -- Supporting documents ----------------------------------------------------------------

  /** The applicant's own request (for the upload), or any request for someone who may view them all. */
  async fileOwner(auth: AuthContext, id: string, onlyMine: boolean) {
    const row = await this.prisma.leaveRequest.findFirst({ where: { id, schoolId: auth.schoolId, ...(onlyMine ? { userId: auth.userId } : {}) } });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    return row;
  }

  async uploadFile(auth: AuthContext, id: string, file: Express.Multer.File | undefined) {
    const row = await this.fileOwner(auth, id, true);
    if (row.status === 'REJECTED' || row.status === 'CANCELLED') throw new ConflictException({ code: 'WRONG_STATUS', message: 'This request is closed.' });
    return this.attachments.upload(auth.schoolId, LEAVE_FILES, id, auth.userId, file);
  }

  listFiles(auth: AuthContext, id: string) {
    return this.attachments.list(auth.schoolId, LEAVE_FILES, id);
  }
}
