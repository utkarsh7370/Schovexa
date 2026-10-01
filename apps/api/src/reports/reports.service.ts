import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthContext } from '../authorization/authorization.types';
import { buildPaginationMeta } from '../common/pagination.util';

export interface StudentReportFilters {
  classId?: string;
  sectionId?: string;
  status?: string;
  search?: string;
}

export interface AttendanceReportFilters {
  classId?: string;
  sectionId?: string;
  from: string;
  to: string;
  search?: string;
}

export interface FeeReportFilters {
  academicYearId?: string;
  feeCategoryId?: string;
  status?: string;
  search?: string;
}

const FEE_STATUSES = ['PENDING', 'PARTIALLY_PAID', 'PAID', 'WAIVED'];

// Every whitespace-separated word must match at least one of the given
// fields (case-insensitive "contains"), so "riya sharma" and "sharma riya"
// both find Riya Sharma. Capped at 6 words / 80 characters.
function wordsOf(search: string | undefined): string[] {
  return (search ?? '').trim().slice(0, 80).split(/\s+/).filter(Boolean).slice(0, 6);
}

const STUDENT_WITH_SECTION = { section: { include: { class: true } } } as const;
type StudentWithSection = Prisma.StudentGetPayload<{ include: typeof STUDENT_WITH_SECTION }>;

const FEE_REPORT_INCLUDE = { student: true, feeStructure: { include: { feeCategory: true } }, payments: true } as const;
type FeeReportRow = Prisma.StudentFeeGetPayload<{ include: typeof FEE_REPORT_INCLUDE }>;

// Every report here is a school-wide aggregate, not a single resource —
// there's nothing for authorizeResource() to check against, so scope is
// enforced up front instead (docs/authorization.md). No default role is
// seeded with report.view under any scope but ALL_SCHOOL; a grant under
// any other scope is denied rather than guessed at.
function requireAllSchoolScope(auth: AuthContext): void {
  if (auth.scope !== 'ALL_SCHOOL') {
    throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Reports require school-wide access.' });
  }
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildStudentWhere(
    schoolId: string,
    filters: { classId?: string; sectionId?: string; status?: string; search?: string },
  ): Prisma.StudentWhereInput {
    const words = wordsOf(filters.search);
    return {
      schoolId,
      deletedAt: null,
      ...(words.length
        ? {
            AND: words.map((word) => {
              const contains = { contains: word, mode: 'insensitive' as const };
              return { OR: [{ firstName: contains }, { lastName: contains }, { admissionNo: contains }] };
            }),
          }
        : {}),
      ...(filters.status ? { status: filters.status as never } : {}),
      ...(filters.sectionId
        ? { sectionId: filters.sectionId }
        : filters.classId
          ? { section: { classId: filters.classId } }
          : {}),
    };
  }

  private toStudentRow(student: StudentWithSection) {
    return {
      studentId: student.id,
      admissionNo: student.admissionNo,
      firstName: student.firstName,
      lastName: student.lastName,
      status: student.status,
      gender: student.gender,
      className: student.section?.class.name ?? null,
      sectionName: student.section?.name ?? null,
    };
  }

  async studentsReport(auth: AuthContext, filters: StudentReportFilters, page: number, pageSize: number) {
    requireAllSchoolScope(auth);
    const where = this.buildStudentWhere(auth.schoolId, filters);
    const [total, students] = await Promise.all([
      this.prisma.student.count({ where }),
      this.prisma.student.findMany({
        where,
        include: STUDENT_WITH_SECTION,
        orderBy: { admissionNo: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { data: students.map((s) => this.toStudentRow(s)), pagination: buildPaginationMeta(page, pageSize, total) };
  }

  async studentsReportRows(auth: AuthContext, filters: StudentReportFilters) {
    requireAllSchoolScope(auth);
    const where = this.buildStudentWhere(auth.schoolId, filters);
    const students = await this.prisma.student.findMany({
      where,
      include: STUDENT_WITH_SECTION,
      orderBy: { admissionNo: 'asc' },
    });
    return students.map((s) => this.toStudentRow(s));
  }

  private async attendanceRowsFor(schoolId: string, from: string, to: string, students: StudentWithSection[]) {
    const studentIds = students.map((s) => s.id);
    const records = studentIds.length
      ? await this.prisma.attendance.findMany({
          where: { schoolId, studentId: { in: studentIds }, date: { gte: new Date(from), lte: new Date(to) } },
        })
      : [];

    const byStudent = new Map<string, typeof records>();
    for (const record of records) {
      const list = byStudent.get(record.studentId) ?? [];
      list.push(record);
      byStudent.set(record.studentId, list);
    }

    return students.map((student) => {
      const studentRecords = byStudent.get(student.id) ?? [];
      const counts = { present: 0, absent: 0, late: 0, excused: 0 };
      for (const record of studentRecords) {
        if (record.status === 'PRESENT') counts.present += 1;
        else if (record.status === 'ABSENT') counts.absent += 1;
        else if (record.status === 'LATE') counts.late += 1;
        else if (record.status === 'EXCUSED') counts.excused += 1;
      }
      const totalMarked = studentRecords.length;
      return {
        studentId: student.id,
        admissionNo: student.admissionNo,
        firstName: student.firstName,
        lastName: student.lastName,
        className: student.section?.class.name ?? null,
        sectionName: student.section?.name ?? null,
        ...counts,
        totalMarked,
        attendancePercent: totalMarked > 0 ? Math.round((counts.present / totalMarked) * 1000) / 10 : null,
      };
    });
  }

  async attendanceReport(auth: AuthContext, filters: AttendanceReportFilters, page: number, pageSize: number) {
    requireAllSchoolScope(auth);
    const where = this.buildStudentWhere(auth.schoolId, { classId: filters.classId, sectionId: filters.sectionId, search: filters.search });
    const total = await this.prisma.student.count({ where });
    // Paginate over students first (cheap), then compute attendance only
    // for that one page's students rather than the whole school.
    const pageStudents = await this.prisma.student.findMany({
      where,
      include: STUDENT_WITH_SECTION,
      orderBy: { admissionNo: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const data = await this.attendanceRowsFor(auth.schoolId, filters.from, filters.to, pageStudents);
    return { data, pagination: buildPaginationMeta(page, pageSize, total) };
  }

  async attendanceReportRows(auth: AuthContext, filters: AttendanceReportFilters) {
    requireAllSchoolScope(auth);
    const where = this.buildStudentWhere(auth.schoolId, { classId: filters.classId, sectionId: filters.sectionId, search: filters.search });
    const students = await this.prisma.student.findMany({
      where,
      include: STUDENT_WITH_SECTION,
      orderBy: { admissionNo: 'asc' },
    });
    return this.attendanceRowsFor(auth.schoolId, filters.from, filters.to, students);
  }

  private buildFeeWhere(schoolId: string, filters: FeeReportFilters): Prisma.StudentFeeWhereInput {
    const words = wordsOf(filters.search);
    // academicYearId and feeCategoryId both live on feeStructure — one
    // relation filter, since Prisma rejects two `feeStructure` keys.
    const structure: Prisma.FeeStructureWhereInput = {};
    if (filters.academicYearId) structure.academicYearId = filters.academicYearId;
    if (filters.feeCategoryId) structure.feeCategoryId = filters.feeCategoryId;
    return {
      schoolId,
      deletedAt: null,
      ...(filters.status && FEE_STATUSES.includes(filters.status) ? { status: filters.status as never } : {}),
      ...(Object.keys(structure).length ? { feeStructure: structure } : {}),
      ...(words.length
        ? {
            AND: words.map((word) => {
              const contains = { contains: word, mode: 'insensitive' as const };
              return {
                OR: [
                  { student: { firstName: contains } },
                  { student: { lastName: contains } },
                  { student: { admissionNo: contains } },
                  { feeStructure: { feeCategory: { name: contains } } },
                ],
              };
            }),
          }
        : {}),
    };
  }

  private toFeeRow(fee: FeeReportRow) {
    const paidMinor = fee.payments.reduce((sum, p) => sum + p.amountMinor, 0);
    return {
      studentFeeId: fee.id,
      admissionNo: fee.student.admissionNo,
      firstName: fee.student.firstName,
      lastName: fee.student.lastName,
      feeCategory: fee.feeStructure.feeCategory.name,
      amountDueMinor: fee.amountDueMinor,
      paidMinor,
      balanceMinor: Math.max(fee.amountDueMinor - paidMinor, 0),
      status: fee.status,
      dueDate: fee.dueDate,
    };
  }

  private async feeTotals(where: Prisma.StudentFeeWhereInput) {
    const fees = await this.prisma.studentFee.findMany({
      where,
      select: { amountDueMinor: true, payments: { select: { amountMinor: true } } },
    });
    let assignedMinor = 0;
    let paidMinor = 0;
    for (const fee of fees) {
      assignedMinor += fee.amountDueMinor;
      paidMinor += fee.payments.reduce((sum, p) => sum + p.amountMinor, 0);
    }
    return { assignedMinor, paidMinor, outstandingMinor: Math.max(assignedMinor - paidMinor, 0) };
  }

  async feesReport(auth: AuthContext, filters: FeeReportFilters, page: number, pageSize: number) {
    requireAllSchoolScope(auth);
    const where = this.buildFeeWhere(auth.schoolId, filters);
    const [total, fees, totals] = await Promise.all([
      this.prisma.studentFee.count({ where }),
      this.prisma.studentFee.findMany({
        where,
        include: FEE_REPORT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.feeTotals(where),
    ]);
    return { data: fees.map((f) => this.toFeeRow(f)), pagination: buildPaginationMeta(page, pageSize, total), totals };
  }

  async feesReportRows(auth: AuthContext, filters: FeeReportFilters) {
    requireAllSchoolScope(auth);
    const where = this.buildFeeWhere(auth.schoolId, filters);
    const fees = await this.prisma.studentFee.findMany({
      where,
      include: FEE_REPORT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return fees.map((f) => this.toFeeRow(f));
  }
}
