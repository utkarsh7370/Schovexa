import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { MarkAttendanceInput, UpdateAttendanceInput } from '@schovexa/validation';
import { dateOnlyToIso, todayInTimezone } from '../common/dates.util';
import { AbsenceAlertsService } from './absence-alerts.service';
import { SchoolSettingsService } from '../school-settings/school-settings.service';
import { describeDayOff } from '../common/school-calendar.util';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly absenceAlerts: AbsenceAlertsService,
    private readonly settings: SchoolSettingsService,
  ) {}

  async markBulk(schoolId: string, markedById: string, input: MarkAttendanceInput) {
    const section = await this.prisma.section.findFirst({
      where: { id: input.sectionId, schoolId, deletedAt: null },
    });
    if (!section) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown section.' });
    }

    const date = new Date(input.date);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Invalid date.' });
    }
    await this.assertEditableDate(schoolId, input.date);

    // Every studentId must actually belong to this section, in this
    // school — a caller with OWN_CLASS scope for their own section could
    // otherwise smuggle attendance rows for a student in a different
    // section/school into this one request.
    const studentIds = input.records.map((r) => r.studentId);
    const validStudents = await this.prisma.student.findMany({
      where: { id: { in: studentIds }, schoolId, sectionId: input.sectionId, deletedAt: null },
      select: { id: true },
    });
    if (validStudents.length !== studentIds.length) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'One or more students are not in this section.',
      });
    }

    // Who was already absent before this save — to tell "newly absent" and
    // "absence corrected" apart from "saved again with no change".
    const before = await this.prisma.attendance.findMany({ where: { schoolId, studentId: { in: studentIds }, date }, select: { studentId: true, status: true } });
    const wasAbsent = new Set(before.filter((b) => b.status === 'ABSENT').map((b) => b.studentId));

    await this.prisma.$transaction(
      input.records.map((record) =>
        this.prisma.attendance.upsert({
          where: { studentId_date: { studentId: record.studentId, date } },
          create: {
            schoolId,
            studentId: record.studentId,
            sectionId: input.sectionId,
            date,
            status: record.status,
            remarks: record.remarks || null,
            markedById,
          },
          update: {
            status: record.status,
            remarks: record.remarks || null,
            markedById,
            sectionId: input.sectionId,
          },
        }),
      ),
    );

    // Today only (assertEditableDate above guarantees it): message the parents
    // of anyone just marked absent, and correct the record for anyone whose
    // absence was a mistake. Never blocks the save.
    await this.absenceAlerts.notifyAbsent(
      schoolId,
      input.records.filter((r) => r.status === 'ABSENT').map((r) => r.studentId),
      input.date.slice(0, 10),
    );
    await this.absenceAlerts.notifyCorrection(
      schoolId,
      input.records.filter((r) => r.status !== 'ABSENT' && wasAbsent.has(r.studentId)).map((r) => r.studentId),
      input.date.slice(0, 10),
    );

    return this.getRosterForSectionDate(schoolId, input.sectionId, input.date);
  }

  async getAbsenceAlerts(schoolId: string, sectionId: string, dateInput: string) {
    const section = await this.prisma.section.findFirst({ where: { id: sectionId, schoolId, deletedAt: null } });
    if (!section) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }
    return this.absenceAlerts.alertsForSection(schoolId, sectionId, dateInput.slice(0, 10));
  }

  async getRosterForSectionDate(schoolId: string, sectionId: string, dateInput: string) {
    const section = await this.prisma.section.findFirst({ where: { id: sectionId, schoolId, deletedAt: null } });
    if (!section) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }

    const date = new Date(dateInput);
    const [students, records] = await Promise.all([
      this.prisma.student.findMany({
        where: { schoolId, sectionId, deletedAt: null },
        orderBy: { admissionNo: 'asc' },
      }),
      this.prisma.attendance.findMany({ where: { schoolId, sectionId, date } }),
    ]);

    const byStudentId = new Map(records.map((r) => [r.studentId, r]));
    return students.map((student) => {
      const record = byStudentId.get(student.id);
      return {
        studentId: student.id,
        admissionNo: student.admissionNo,
        firstName: student.firstName,
        lastName: student.lastName,
        schoolDay: student.schoolDay,
        attendanceId: record?.id ?? null,
        status: record?.status ?? null,
        remarks: record?.remarks ?? null,
      };
    });
  }

  async getHistoryForStudent(schoolId: string, studentId: string, from: string, to: string) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId, deletedAt: null } });
    if (!student) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }

    return this.prisma.attendance.findMany({
      where: { schoolId, studentId, date: { gte: new Date(from), lte: new Date(to) } },
      orderBy: { date: 'desc' },
    });
  }

  async getSummaryForSection(schoolId: string, sectionId: string, from: string, to: string) {
    const section = await this.prisma.section.findFirst({ where: { id: sectionId, schoolId, deletedAt: null } });
    if (!section) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }

    const [students, records] = await Promise.all([
      this.prisma.student.findMany({
        where: { schoolId, sectionId, deletedAt: null },
        orderBy: { admissionNo: 'asc' },
      }),
      this.prisma.attendance.findMany({
        where: { schoolId, sectionId, date: { gte: new Date(from), lte: new Date(to) } },
      }),
    ]);

    const recordsByStudent = new Map<string, typeof records>();
    for (const record of records) {
      const list = recordsByStudent.get(record.studentId) ?? [];
      list.push(record);
      recordsByStudent.set(record.studentId, list);
    }

    return students.map((student) => {
      const studentRecords = recordsByStudent.get(student.id) ?? [];
      const counts = { present: 0, absent: 0, late: 0, excused: 0 };
      for (const record of studentRecords) {
        if (record.status === 'PRESENT') counts.present += 1;
        else if (record.status === 'ABSENT') counts.absent += 1;
        else if (record.status === 'LATE') counts.late += 1;
        else if (record.status === 'EXCUSED') counts.excused += 1;
      }
      return {
        studentId: student.id,
        admissionNo: student.admissionNo,
        firstName: student.firstName,
        lastName: student.lastName,
        schoolDay: student.schoolDay,
        ...counts,
        total: studentRecords.length,
      };
    });
  }

  // Looked up before authorizeResource() runs (the controller needs
  // this row's sectionId to know what to authorize against) — never
  // trust a caller-supplied sectionId for that check, only the row's own.
  async findForAuth(schoolId: string, attendanceId: string) {
    const record = await this.prisma.attendance.findFirst({ where: { id: attendanceId, schoolId } });
    if (!record) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }
    return record;
  }

  async correct(schoolId: string, attendanceId: string, input: UpdateAttendanceInput) {
    const record = await this.findForAuth(schoolId, attendanceId);
    await this.assertEditableDate(schoolId, dateOnlyToIso(record.date));
    const updated = await this.prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.remarks !== undefined ? { remarks: input.remarks || null } : {}),
      },
    });
    if (input.status !== undefined && input.status !== record.status) {
      const day = dateOnlyToIso(record.date);
      if (input.status === 'ABSENT') await this.absenceAlerts.notifyAbsent(schoolId, [record.studentId], day);
      else if (record.status === 'ABSENT') await this.absenceAlerts.notifyCorrection(schoolId, [record.studentId], day);
    }
    return updated;
  }

  /**
   * The school's current calendar date — what the UI treats as "today" — plus
   * how far back attendance can still be changed (the school's edit window)
   * and whether today is a teaching day.
   */
  async getToday(schoolId: string): Promise<{ today: string; editableFrom: string; editWindowDays: number; schoolDay: { working: boolean; reason: string | null; message: string } }> {
    const [school, settings] = await Promise.all([
      this.prisma.school.findUnique({ where: { id: schoolId }, select: { timezone: true } }),
      this.settings.get(schoolId),
    ]);
    const today = todayInTimezone(school?.timezone);
    const [status] = await this.settings.dayStatuses(schoolId, today, today, settings);
    return {
      today,
      editableFrom: shiftDay(today, -settings.attendanceEditWindowDays),
      editWindowDays: settings.attendanceEditWindowDays,
      schoolDay: { working: status.working, reason: status.reason, message: status.working ? '' : describeDayOff(status) },
    };
  }

  // Attendance is a same-day record by default: it can be marked or changed
  // only on the day itself, in the school's own time zone. A school can allow
  // a short correction window (attendanceEditWindowDays), after which it
  // locks for everyone — a Director included — so history can't be quietly
  // rewritten. It can't be marked in advance, and (unless the school allows
  // it) not on a day the school is closed. Reading past days stays open.
  private async assertEditableDate(schoolId: string, dateIso: string): Promise<void> {
    const [school, settings] = await Promise.all([
      this.prisma.school.findUnique({ where: { id: schoolId }, select: { timezone: true } }),
      this.settings.get(schoolId),
    ]);
    const today = todayInTimezone(school?.timezone);
    const day = dateIso.slice(0, 10);
    if (day > today) {
      throw new BadRequestException({
        code: 'ATTENDANCE_LOCKED',
        message: 'Attendance can only be marked on the day itself, not in advance.',
      });
    }
    if (day < shiftDay(today, -settings.attendanceEditWindowDays)) {
      throw new BadRequestException({
        code: 'ATTENDANCE_LOCKED',
        message:
          settings.attendanceEditWindowDays === 0
            ? 'Attendance for a past date is locked and can no longer be changed.'
            : `Attendance can be changed for ${settings.attendanceEditWindowDays} day${settings.attendanceEditWindowDays === 1 ? '' : 's'} after the day itself. This date is locked.`,
      });
    }
    if (!settings.attendanceOnNonWorkingDays) {
      const [status] = await this.settings.dayStatuses(schoolId, day, day, settings);
      if (!status.working) {
        throw new BadRequestException({ code: 'NOT_A_SCHOOL_DAY', message: `${describeDayOff(status)} Attendance isn’t taken on days the school is closed.` });
      }
    }
  }
}

function shiftDay(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}
