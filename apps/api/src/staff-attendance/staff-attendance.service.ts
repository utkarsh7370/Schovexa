import { SchoolSettingsService } from '../school-settings/school-settings.service';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { StaffAttendance } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { NotificationsService } from '../notifications/notifications.service';
import { dateOnlyToIso, hmToMinutes, ISO_DATE, minutesOfDayInTimezone, todayInTimezone } from '../common/dates.util';
import type { AuthContext } from '../authorization/authorization.types';

const MARK = 'staffAttendance.mark';
@Injectable()
export class StaffAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authorization: AuthorizationService,
    private readonly notifications: NotificationsService,
    private readonly settings: SchoolSettingsService,
  ) {}

  private async school(schoolId: string) {
    return this.prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
  }

  private toDto(row: StaffAttendance) {
    return {
      id: row.id,
      date: dateOnlyToIso(row.date),
      punchInAt: row.punchInAt,
      punchOutAt: row.punchOutAt,
      lateMinutes: row.lateMinutes,
      earlyLeaveMinutes: row.earlyLeaveMinutes,
      source: row.source,
      approval: row.approval,
      decidedAt: row.decidedAt,
      decisionNote: row.decisionNote,
    };
  }

  // -- Punching in and out ---------------------------------------------------

  /** What today looks like for the signed-in person: the school's hours and whatever they have punched so far. */
  async today(auth: AuthContext) {
    const school = await this.school(auth.schoolId);
    const date = todayInTimezone(school.timezone);
    const [record, holiday] = await Promise.all([
      this.prisma.staffAttendance.findUnique({ where: { schoolId_userId_date: { schoolId: auth.schoolId, userId: auth.userId, date: new Date(date) } } }),
      this.holidayOn(auth.schoolId, date),
    ]);
    return {
      date,
      schedule: { punchIn: school.staffPunchInTime, punchOut: school.staffPunchOutTime, graceMinutes: school.staffLateGraceMinutes },
      holiday: holiday ? { id: holiday.id, name: holiday.name } : null,
      record: record ? this.toDto(record) : null,
    };
  }

  private async holidayOn(schoolId: string, date: string) {
    return this.prisma.holiday.findFirst({
      where: { schoolId, deletedAt: null, startDate: { lte: new Date(date) }, endDate: { gte: new Date(date) } },
    });
  }

  async punchIn(auth: AuthContext) {
    const school = await this.school(auth.schoolId);
    const now = new Date();
    const date = todayInTimezone(school.timezone, now);

    const holiday = await this.holidayOn(auth.schoolId, date);
    if (holiday) {
      throw new BadRequestException({ code: 'HOLIDAY', message: `Today is a school holiday (${holiday.name}) — there’s nothing to punch in for.` });
    }

    const existing = await this.prisma.staffAttendance.findUnique({
      where: { schoolId_userId_date: { schoolId: auth.schoolId, userId: auth.userId, date: new Date(date) } },
    });
    if (existing) {
      throw new ConflictException({ code: 'ALREADY_PUNCHED_IN', message: 'You have already punched in today.' });
    }

    const localMinutes = minutesOfDayInTimezone(school.timezone, now);
    const startMinutes = hmToMinutes(school.staffPunchInTime);
    const late = localMinutes > startMinutes + school.staffLateGraceMinutes;

    // Whoever may approve attendance doesn't need to wait for someone else
    // to approve their own — a Director's or Principal's day is simply recorded.
    const autoApprove = !!(await this.authorization.getGrant(auth.roleId, 'staffAttendance.approve'));

    const row = await this.prisma.staffAttendance.create({
      data: {
        schoolId: auth.schoolId,
        userId: auth.userId,
        date: new Date(date),
        punchInAt: now,
        lateMinutes: late ? localMinutes - startMinutes : 0,
        approval: autoApprove ? 'APPROVED' : 'PENDING',
        ...(autoApprove ? { decidedById: auth.userId, decidedAt: now, decisionNote: 'Auto-approved' } : {}),
      },
    });
    await this.audit.record({ schoolId: auth.schoolId, userId: auth.userId, action: 'staff_attendance.punch_in', module: 'staff-attendance', resourceType: 'StaffAttendance', resourceId: row.id });
    return this.toDto(row);
  }

  async punchOut(auth: AuthContext) {
    const school = await this.school(auth.schoolId);
    const now = new Date();
    const date = todayInTimezone(school.timezone, now);

    const existing = await this.prisma.staffAttendance.findUnique({
      where: { schoolId_userId_date: { schoolId: auth.schoolId, userId: auth.userId, date: new Date(date) } },
    });
    if (!existing) {
      throw new BadRequestException({ code: 'NOT_PUNCHED_IN', message: 'Punch in first — there is no attendance for you today yet.' });
    }
    if (existing.punchOutAt) {
      throw new ConflictException({ code: 'ALREADY_PUNCHED_OUT', message: 'You have already punched out today.' });
    }
    if (existing.approval === 'REJECTED') {
      throw new BadRequestException({ code: 'REJECTED', message: 'Today’s attendance was rejected, so it can’t be changed. Speak to your Principal.' });
    }

    const localMinutes = minutesOfDayInTimezone(school.timezone, now);
    const endMinutes = hmToMinutes(school.staffPunchOutTime);
    const row = await this.prisma.staffAttendance.update({
      where: { id: existing.id },
      data: { punchOutAt: now, earlyLeaveMinutes: localMinutes < endMinutes ? endMinutes - localMinutes : 0 },
    });
    await this.audit.record({ schoolId: auth.schoolId, userId: auth.userId, action: 'staff_attendance.punch_out', module: 'staff-attendance', resourceType: 'StaffAttendance', resourceId: row.id });
    return this.toDto(row);
  }

  /** Your own days in a month, newest first, with totals. */
  async mine(auth: AuthContext, month: string | undefined) {
    const school = await this.school(auth.schoolId);
    const today = todayInTimezone(school.timezone);
    const target = month && /^\d{4}-\d{2}$/.test(month) ? month : today.slice(0, 7);
    const [year, mon] = target.split('-').map(Number);
    const from = new Date(Date.UTC(year, mon - 1, 1));
    const to = new Date(Date.UTC(year, mon, 0));
    const rows = await this.prisma.staffAttendance.findMany({
      where: { schoolId: auth.schoolId, userId: auth.userId, date: { gte: from, lte: to } },
      orderBy: { date: 'desc' },
    });
    return {
      month: target,
      schedule: { punchIn: school.staffPunchInTime, punchOut: school.staffPunchOutTime, graceMinutes: school.staffLateGraceMinutes },
      summary: {
        daysPresent: rows.length,
        daysLate: rows.filter((r) => r.lateMinutes > 0).length,
        pendingApproval: rows.filter((r) => r.approval === 'PENDING').length,
        rejected: rows.filter((r) => r.approval === 'REJECTED').length,
      },
      records: rows.map((r) => this.toDto(r)),
    };
  }

  // -- The approver's view -----------------------------------------------------

  /** Everyone who is expected to punch in (their role grants staffAttendance.mark), with their day. */
  async roster(auth: AuthContext, date: string | undefined) {
    const school = await this.school(auth.schoolId);
    const today = todayInTimezone(school.timezone);
    const day = date ?? today;
    if (!ISO_DATE.test(day) || Number.isNaN(new Date(day).getTime())) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Use a valid date (YYYY-MM-DD).' });
    }
    if (day > today) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Attendance can’t be viewed for a future date.' });
    }

    const [memberships, records, holiday] = await Promise.all([
      this.prisma.schoolMembership.findMany({
        where: { schoolId: auth.schoolId, status: 'ACTIVE', deletedAt: null, role: { deletedAt: null, permissions: { some: { permission: { key: MARK } } } } },
        include: { user: true, role: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.staffAttendance.findMany({ where: { schoolId: auth.schoolId, date: new Date(day) } }),
      this.holidayOn(auth.schoolId, day),
    ]);
    const byUser = new Map(records.map((r) => [r.userId, r]));

    // Someone who has since lost the role but already punched in that day still appears.
    const known = new Set(memberships.map((m) => m.userId));
    const extra = records.filter((r) => !known.has(r.userId));
    const extraUsers = extra.length ? await this.prisma.user.findMany({ where: { id: { in: extra.map((r) => r.userId) } } }) : [];

    const rows = [
      ...memberships.map((m) => ({ userId: m.userId, name: `${m.user.firstName} ${m.user.lastName}`.trim(), email: m.user.email, roleName: m.role.name })),
      ...extraUsers.map((u) => ({ userId: u.id, name: `${u.firstName} ${u.lastName}`.trim(), email: u.email, roleName: 'Former role' })),
    ].map((person) => {
      const record = byUser.get(person.userId);
      return { ...person, record: record ? this.toDto(record) : null };
    });

    return {
      date: day,
      isToday: day === today,
      holiday: holiday ? { id: holiday.id, name: holiday.name } : null,
      schedule: { punchIn: school.staffPunchInTime, punchOut: school.staffPunchOutTime, graceMinutes: school.staffLateGraceMinutes },
      summary: {
        expected: rows.length,
        present: rows.filter((r) => r.record).length,
        late: rows.filter((r) => (r.record?.lateMinutes ?? 0) > 0).length,
        notMarked: rows.filter((r) => !r.record).length,
        pendingApproval: rows.filter((r) => r.record?.approval === 'PENDING').length,
      },
      rows,
    };
  }

  /** How many days are waiting for a decision, for the dashboard banner. */
  async pending(auth: AuthContext) {
    const rows = await this.prisma.staffAttendance.findMany({
      where: { schoolId: auth.schoolId, approval: 'PENDING', userId: { not: auth.userId } },
      select: { date: true, userId: true },
    });
    const dates = rows.map((r) => dateOnlyToIso(r.date)).sort();
    return { count: rows.length, people: new Set(rows.map((r) => r.userId)).size, oldestDate: dates[0] ?? null };
  }

  // -- Decisions ----------------------------------------------------------------

  private async findPending(auth: AuthContext, id: string): Promise<StaffAttendance> {
    const row = await this.prisma.staffAttendance.findFirst({ where: { id, schoolId: auth.schoolId } });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    if (row.userId === auth.userId) {
      throw new BadRequestException({ code: 'OWN_RECORD', message: 'You can’t approve or reject your own attendance.' });
    }
    if (row.approval !== 'PENDING') {
      throw new BadRequestException({ code: 'ALREADY_DECIDED', message: 'This day has already been decided.' });
    }
    return row;
  }

  async approve(auth: AuthContext, id: string, note?: string) {
    const row = await this.findPending(auth, id);
    const updated = await this.prisma.staffAttendance.update({
      where: { id },
      data: { approval: 'APPROVED', decidedById: auth.userId, decidedAt: new Date(), decisionNote: note?.trim() || null },
    });
    await this.afterDecision(auth, row, 'staff_attendance.approve', `Your attendance for ${dateOnlyToIso(row.date)} was approved`, note?.trim() || 'Thank you.');
    return this.toDto(updated);
  }

  async reject(auth: AuthContext, id: string, note: string) {
    const row = await this.findPending(auth, id);
    const updated = await this.prisma.staffAttendance.update({
      where: { id },
      data: { approval: 'REJECTED', decidedById: auth.userId, decidedAt: new Date(), decisionNote: note.trim() },
    });
    await this.afterDecision(auth, row, 'staff_attendance.reject', `Your attendance for ${dateOnlyToIso(row.date)} was rejected`, note.trim());
    return this.toDto(updated);
  }

  /** Approve every waiting day for one date in one go (never your own). */
  async approveAll(auth: AuthContext, date: string) {
    const rows = await this.prisma.staffAttendance.findMany({
      where: { schoolId: auth.schoolId, date: new Date(date), approval: 'PENDING', userId: { not: auth.userId } },
    });
    if (rows.length === 0) return { approved: 0 };
    const now = new Date();
    await this.prisma.staffAttendance.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { approval: 'APPROVED', decidedById: auth.userId, decidedAt: now },
    });
    const tellStaff = (await this.settings.get(auth.schoolId)).notifyStaffAttendanceDecisions;
    for (const row of rows) {
      if (!tellStaff) break;
      await this.notifications.notify({
        schoolId: auth.schoolId,
        userIds: [row.userId],
        title: `Your attendance for ${dateOnlyToIso(row.date)} was approved`,
        body: 'Thank you.',
        link: '/dashboard/my-attendance',
      });
    }
    await this.audit.record({
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'staff_attendance.approve_all',
      module: 'staff-attendance',
      resourceType: 'StaffAttendance',
      resourceId: date,
      metadata: { count: rows.length },
    });
    return { approved: rows.length };
  }

  private async afterDecision(auth: AuthContext, row: StaffAttendance, action: string, title: string, body: string) {
    await this.audit.record({ schoolId: auth.schoolId, userId: auth.userId, action, module: 'staff-attendance', resourceType: 'StaffAttendance', resourceId: row.id });
    if (!(await this.settings.get(auth.schoolId)).notifyStaffAttendanceDecisions) return;
    await this.notifications.notify({ schoolId: auth.schoolId, userIds: [row.userId], title, body, link: '/dashboard/my-attendance' });
  }
}
