import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { MarkAttendanceInput, UpdateAttendanceInput } from '@schovexa/validation';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.getRosterForSectionDate(schoolId, input.sectionId, input.date);
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

  async correct(attendanceId: string, input: UpdateAttendanceInput) {
    return this.prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.remarks !== undefined ? { remarks: input.remarks || null } : {}),
      },
    });
  }
}
