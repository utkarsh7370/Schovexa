import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateStudentInput, LinkParentInput, UpdateStudentInput } from '@schovexa/validation';
import type { AuthContext } from '../authorization/authorization.types';

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 100;

export interface StudentListFilters {
  sectionId?: string;
  classId?: string;
  classTeacherId?: string;
  status?: string;
  schoolDay?: string;
  search?: string;
  // Pagination is opt-in: without `page` the list stays the plain array
  // other screens (dashboard count, my-children, attendance) rely on.
  page?: number;
  pageSize?: number;
}

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  // A single resourceId (e.g. GET /students/:id) is scope-checked by
  // AuthorizationService.authorizeResource() in the controller — but a
  // *list* has no single resourceId for it to check against, so the
  // filtering has to happen here, at query-build time, or a caller with
  // e.g. OWN_STUDENTS/OWN_CHILDREN scope would see every student in the
  // school instead of just the ones their scope actually covers.
  async list(auth: AuthContext, filters: StudentListFilters) {
    const scopeFilter = await this.buildScopeFilter(auth);
    const paged = filters.page !== undefined;
    if (scopeFilter === null) {
      return paged ? this.emptyPage(filters) : [];
    }

    const where: Prisma.StudentWhereInput = {
      schoolId: auth.schoolId,
      deletedAt: null,
      ...scopeFilter,
      ...(filters.status ? { status: filters.status as never } : {}),
      ...(filters.schoolDay ? { schoolDay: filters.schoolDay as never } : {}),
      ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
      ...this.buildSectionFilters(filters),
      ...this.buildSearchFilter(filters.search),
    };

    // Section + class + class teacher ride along on every row so the
    // list can render a full card (class, section, class teacher)
    // without an N+1 of follow-up requests per student.
    const include = {
      section: {
        include: {
          class: true,
          classTeacher: { include: { user: { select: { firstName: true, lastName: true } } } },
        },
      },
    } satisfies Prisma.StudentInclude;
    const orderBy: Prisma.StudentOrderByWithRelationInput[] = [{ admissionNo: 'asc' }, { id: 'asc' }];

    if (!paged) {
      return this.prisma.student.findMany({ where, orderBy, include });
    }

    const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
    const page = filters.page ?? 1;
    const [total, items] = await Promise.all([
      this.prisma.student.count({ where }),
      this.prisma.student.findMany({ where, orderBy, include, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  private emptyPage(filters: StudentListFilters) {
    return { items: [], total: 0, page: filters.page ?? 1, pageSize: filters.pageSize ?? DEFAULT_PAGE_SIZE, totalPages: 1 };
  }

  // classId / classTeacherId live on Section, so both fold into one
  // `section` relation filter (Prisma rejects two `section` keys).
  private buildSectionFilters(filters: StudentListFilters): Prisma.StudentWhereInput {
    const section: Prisma.SectionWhereInput = {};
    if (filters.classId) section.classId = filters.classId;
    if (filters.classTeacherId) section.classTeacherId = filters.classTeacherId;
    return Object.keys(section).length ? { section: { is: { ...section, deletedAt: null } } } : {};
  }

  // Global search: every whitespace-separated word must match at least
  // one of — the student's own name/admission number, their class or
  // section name, or a linked parent's name/phone. So "riya sharma",
  // "A-014", "grade 5 b" and a parent's phone number all find people.
  private buildSearchFilter(search: string | undefined): Prisma.StudentWhereInput {
    const words = (search ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 6);
    if (!words.length) return {};
    return {
      AND: words.map((word) => {
        const contains = { contains: word, mode: 'insensitive' as const };
        return {
          OR: [
            { firstName: contains },
            { lastName: contains },
            { admissionNo: contains },
            { section: { is: { name: contains } } },
            { section: { is: { class: { is: { name: contains } } } } },
            { parents: { some: { parent: { OR: [{ firstName: contains }, { lastName: contains }, { phone: contains }] } } } },
          ],
        };
      }),
    };
  }

  // Returns null when the caller's scope resolves to "no students" (no
  // Parent/Teacher profile yet, or one with no linked children/sections)
  // — the list() caller above turns that into an empty array, never a
  // fall-through to the unfiltered ALL_SCHOOL query below it.
  private async buildScopeFilter(auth: AuthContext): Promise<Prisma.StudentWhereInput | null> {
    switch (auth.scope) {
      case 'ALL_SCHOOL':
        return {};

      case 'OWN_CHILDREN': {
        const parent = await this.prisma.parent.findFirst({
          where: { schoolId: auth.schoolId, userId: auth.userId, deletedAt: null },
        });
        if (!parent) return null;
        const links = await this.prisma.studentParent.findMany({
          where: { schoolId: auth.schoolId, parentId: parent.id },
          select: { studentId: true },
        });
        if (!links.length) return null;
        return { id: { in: links.map((l) => l.studentId) } };
      }

      case 'OWN_STUDENTS': {
        const teacher = await this.prisma.teacher.findFirst({
          where: { schoolId: auth.schoolId, userId: auth.userId, deletedAt: null },
        });
        if (!teacher) return null;
        const [classTeacherOf, assignments] = await Promise.all([
          this.prisma.section.findMany({
            where: { schoolId: auth.schoolId, classTeacherId: teacher.id, deletedAt: null },
            select: { id: true },
          }),
          this.prisma.teacherAssignment.findMany({
            where: { schoolId: auth.schoolId, teacherId: teacher.id, deletedAt: null },
            select: { sectionId: true },
          }),
        ]);
        const sectionIds = [...new Set([...classTeacherOf.map((s) => s.id), ...assignments.map((a) => a.sectionId)])];
        if (!sectionIds.length) return null;
        return { sectionId: { in: sectionIds } };
      }

      default:
        // SELF/OWN_CLASS/OWN_SUBJECT are not meaningful scopes for a
        // student list and no role is seeded with student.view under
        // them — deny rather than silently fall through to ALL_SCHOOL.
        return null;
    }
  }

  async create(schoolId: string, input: CreateStudentInput) {
    const existing = await this.prisma.student.findFirst({
      where: { schoolId, admissionNo: input.admissionNo, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'A student with this admission number already exists.',
      });
    }

    const sectionId = await this.resolveSectionId(schoolId, input.sectionId);

    return this.prisma.student.create({
      data: {
        schoolId,
        admissionNo: input.admissionNo,
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
        gender: input.gender || null,
        sectionId,
        ...(input.schoolDay ? { schoolDay: input.schoolDay } : {}),
      },
    });
  }

  async findOne(schoolId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId, deletedAt: null },
      include: {
        section: {
          include: {
            class: true,
            classTeacher: { include: { user: { select: { firstName: true, lastName: true } } } },
          },
        },
        parents: { include: { parent: true } },
      },
    });
    if (!student) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }
    return student;
  }

  async update(schoolId: string, studentId: string, input: UpdateStudentInput) {
    const existing = await this.prisma.student.findFirst({ where: { id: studentId, schoolId, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }

    const data: Record<string, unknown> = {};
    if (input.firstName !== undefined) data.firstName = input.firstName;
    if (input.lastName !== undefined) data.lastName = input.lastName;
    if (input.dateOfBirth !== undefined) data.dateOfBirth = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
    if (input.gender !== undefined) data.gender = input.gender || null;
    if (input.sectionId !== undefined) data.sectionId = await this.resolveSectionId(schoolId, input.sectionId);
    if (input.status !== undefined) data.status = input.status;
    if (input.schoolDay !== undefined) data.schoolDay = input.schoolDay;

    return this.prisma.student.update({ where: { id: studentId }, data });
  }

  async remove(schoolId: string, studentId: string) {
    const existing = await this.prisma.student.findFirst({ where: { id: studentId, schoolId, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }
    await this.prisma.student.update({ where: { id: studentId }, data: { deletedAt: new Date() } });
    return { id: studentId };
  }

  async linkParent(schoolId: string, studentId: string, input: LinkParentInput) {
    const [student, parent] = await Promise.all([
      this.prisma.student.findFirst({ where: { id: studentId, schoolId, deletedAt: null } }),
      this.prisma.parent.findFirst({ where: { id: input.parentId, schoolId, deletedAt: null } }),
    ]);
    if (!student || !parent) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }

    const existing = await this.prisma.studentParent.findFirst({
      where: { studentId, parentId: input.parentId },
    });
    if (existing) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'This parent is already linked.' });
    }

    return this.prisma.studentParent.create({
      data: { schoolId, studentId, parentId: input.parentId, relation: input.relation, isPrimary: input.isPrimary },
      include: { parent: true },
    });
  }

  async unlinkParent(schoolId: string, studentId: string, parentId: string) {
    const link = await this.prisma.studentParent.findFirst({
      where: { studentId, parentId, schoolId },
    });
    if (!link) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }
    await this.prisma.studentParent.delete({ where: { id: link.id } });
    return { studentId, parentId };
  }

  private async resolveSectionId(schoolId: string, sectionId: string | undefined): Promise<string | null> {
    if (!sectionId) return null;
    const section = await this.prisma.section.findFirst({ where: { id: sectionId, schoolId, deletedAt: null } });
    if (!section) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown section.' });
    }
    return section.id;
  }
}
