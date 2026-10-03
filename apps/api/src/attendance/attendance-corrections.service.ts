import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { RequestAttendanceCorrectionInput } from '@schovexa/validation';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../authorization/authorization.types';
import { dateOnlyToIso } from '../common/dates.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolClockService } from '../teaching/school-clock.service';
import { TeachingScopeService } from '../teaching/teaching-scope.service';
import { AttendanceService } from './attendance.service';

interface Meta {
  ipAddress: string | null;
  userAgent: string | null;
}

const INCLUDE = { student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } }, section: { select: { id: true, name: true, class: { select: { name: true } } } } } satisfies Prisma.AttendanceCorrectionInclude;
type Row = Prisma.AttendanceCorrectionGetPayload<{ include: typeof INCLUDE }>;

// Attendance locks after the school's edit window so history can't be quietly rewritten. A mistake
// found later is not edited — it is asked for: teacher → request (with a reason) → administrator
// approves or rejects → only then does the record change, and the decision is audited.
@Injectable()
export class AttendanceCorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    private readonly scopeService: TeachingScopeService,
    private readonly clock: SchoolClockService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private async names(ids: (string | null)[]) {
    const real = [...new Set(ids.filter((i): i is string => !!i))];
    const users = await this.prisma.user.findMany({ where: { id: { in: real } }, select: { id: true, firstName: true, lastName: true } });
    return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  }

  private toRow(c: Row, names: Map<string, string>) {
    return {
      id: c.id,
      status: c.status,
      date: dateOnlyToIso(c.date),
      fromStatus: c.fromStatus,
      toStatus: c.toStatus,
      remarks: c.remarks,
      reason: c.reason,
      createdAt: c.createdAt,
      requestedBy: names.get(c.requestedById) ?? null,
      requestedById: c.requestedById,
      decidedBy: c.decidedById ? (names.get(c.decidedById) ?? null) : null,
      decidedAt: c.decidedAt,
      decisionNote: c.decisionNote,
      student: { id: c.student.id, name: `${c.student.firstName} ${c.student.lastName}`.trim(), admissionNo: c.student.admissionNo },
      section: { id: c.section.id, name: `${c.section.class.name} – ${c.section.name}` },
    };
  }

  async request(auth: AuthContext, input: RequestAttendanceCorrectionInput, meta: Meta) {
    const scope = await this.scopeService.resolve(auth);
    scope.assertSection(input.sectionId);
    const student = await this.prisma.student.findFirst({ where: { id: input.studentId, schoolId: auth.schoolId, sectionId: input.sectionId, deletedAt: null }, select: { id: true, firstName: true } });
    if (!student) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });

    const day = input.date;
    if (day > (await this.clock.today(auth.schoolId))) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Attendance can’t be corrected for a day that hasn’t happened yet.' });
    }
    if (!(await this.attendance.isLocked(auth.schoolId, day))) {
      throw new BadRequestException({ code: 'STILL_EDITABLE', message: 'This day can still be edited directly — no request is needed.' });
    }
    const date = new Date(day);
    const [current, pending] = await Promise.all([
      this.prisma.attendance.findUnique({ where: { studentId_date: { studentId: student.id, date } }, select: { status: true } }),
      this.prisma.attendanceCorrection.findFirst({ where: { schoolId: auth.schoolId, studentId: student.id, date, status: 'REQUESTED' } }),
    ]);
    if (pending) throw new ConflictException({ code: 'ALREADY_REQUESTED', message: 'A correction for this student and day is already waiting for a decision.' });
    if (current?.status === input.toStatus) throw new BadRequestException({ code: 'NO_CHANGE', message: `That day is already marked ${input.toStatus.toLowerCase().replace('_', ' ')}.` });

    const created = await this.prisma.attendanceCorrection.create({
      data: { schoolId: auth.schoolId, studentId: student.id, sectionId: input.sectionId, date, fromStatus: current?.status ?? null, toStatus: input.toStatus, remarks: input.remarks || null, reason: input.reason, requestedById: auth.userId },
      include: INCLUDE,
    });
    await this.audit.record({ schoolId: auth.schoolId, userId: auth.userId, action: 'attendance.correction.requested', module: 'attendance', resourceType: 'AttendanceCorrection', resourceId: created.id, metadata: { studentId: student.id, date: day, from: current?.status ?? null, to: input.toStatus, reason: input.reason }, ...meta });

    const approvers = (await this.notifications.usersWithPermission(auth.schoolId, 'attendance.approveCorrection')).filter((u) => u.id !== auth.userId);
    await this.notifications.notify({
      schoolId: auth.schoolId,
      userIds: approvers.map((u) => u.id),
      title: `Attendance correction: ${student.firstName} (${day})`,
      body: `${current?.status ?? 'No record'} → ${input.toStatus}. Reason: ${input.reason}`,
      link: '/dashboard/attendance?tab=corrections',
    });
    return this.toRow(created, await this.names([created.requestedById]));
  }

  async list(auth: AuthContext, status: string | undefined, page: number, pageSize: number) {
    const scope = await this.scopeService.resolve(auth);
    const where: Prisma.AttendanceCorrectionWhereInput = {
      schoolId: auth.schoolId,
      ...scope.sectionWhere(),
      // Teachers see their own requests; whoever decides sees them all.
      ...(scope.all ? {} : { requestedById: auth.userId }),
      ...(status && ['REQUESTED', 'APPROVED', 'REJECTED'].includes(status) ? { status: status as 'REQUESTED' | 'APPROVED' | 'REJECTED' } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.attendanceCorrection.count({ where }),
      this.prisma.attendanceCorrection.findMany({ where, include: INCLUDE, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    const names = await this.names(rows.flatMap((r) => [r.requestedById, r.decidedById]));
    return { data: rows.map((r) => this.toRow(r, names)), total, page, pageSize };
  }

  private async one(auth: AuthContext, id: string): Promise<Row> {
    const row = await this.prisma.attendanceCorrection.findFirst({ where: { id, schoolId: auth.schoolId }, include: INCLUDE });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    return row;
  }

  async approve(auth: AuthContext, id: string, note: string | undefined, meta: Meta) {
    const row = await this.one(auth, id);
    if (row.status !== 'REQUESTED') throw new ConflictException({ code: 'WRONG_STATUS', message: 'This request has already been decided.' });
    if (row.requestedById === auth.userId) throw new ForbiddenException({ code: 'CANNOT_APPROVE_OWN', message: 'You can’t decide a correction you asked for — someone else has to.' });
    const before = await this.attendance.applyApprovedCorrection(auth.schoolId, row, auth.userId);
    const updated = await this.prisma.attendanceCorrection.update({ where: { id }, data: { status: 'APPROVED', decidedById: auth.userId, decidedAt: new Date(), decisionNote: note || null }, include: INCLUDE });
    await this.audit.record({ schoolId: auth.schoolId, userId: auth.userId, action: 'attendance.correction.approved', module: 'attendance', resourceType: 'AttendanceCorrection', resourceId: id, metadata: { studentId: row.studentId, date: dateOnlyToIso(row.date), from: before, to: row.toStatus, note: note ?? null }, ...meta });
    await this.notifications.notify({ schoolId: auth.schoolId, userIds: [row.requestedById], title: 'Attendance correction approved', body: `${row.student.firstName} ${row.student.lastName}, ${dateOnlyToIso(row.date)}: now ${row.toStatus}.`, link: '/dashboard/attendance?tab=corrections' });
    return this.toRow(updated, await this.names([updated.requestedById, updated.decidedById]));
  }

  async reject(auth: AuthContext, id: string, note: string, meta: Meta) {
    const row = await this.one(auth, id);
    if (row.status !== 'REQUESTED') throw new ConflictException({ code: 'WRONG_STATUS', message: 'This request has already been decided.' });
    if (row.requestedById === auth.userId) throw new ForbiddenException({ code: 'CANNOT_APPROVE_OWN', message: 'You can’t decide a correction you asked for — someone else has to.' });
    const updated = await this.prisma.attendanceCorrection.update({ where: { id }, data: { status: 'REJECTED', decidedById: auth.userId, decidedAt: new Date(), decisionNote: note }, include: INCLUDE });
    await this.audit.record({ schoolId: auth.schoolId, userId: auth.userId, action: 'attendance.correction.rejected', module: 'attendance', resourceType: 'AttendanceCorrection', resourceId: id, metadata: { studentId: row.studentId, date: dateOnlyToIso(row.date), note }, ...meta });
    await this.notifications.notify({ schoolId: auth.schoolId, userIds: [row.requestedById], title: 'Attendance correction rejected', body: `${row.student.firstName} ${row.student.lastName}, ${dateOnlyToIso(row.date)}: ${note}`, link: '/dashboard/attendance?tab=corrections' });
    return this.toRow(updated, await this.names([updated.requestedById, updated.decidedById]));
  }
}
