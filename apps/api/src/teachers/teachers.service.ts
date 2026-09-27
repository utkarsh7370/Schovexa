import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateTeacherAssignmentInput,
  CreateTeacherInput,
  UpdateTeacherInput,
} from '@schovexa/validation';

@Injectable()
export class TeachersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(schoolId: string) {
    const teachers = await this.prisma.teacher.findMany({
      where: { schoolId, deletedAt: null },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return teachers.map((t) => this.toDto(t));
  }

  async create(schoolId: string, input: CreateTeacherInput) {
    // A teacher profile always attaches to an existing, active member of
    // this school (invited/onboarded via the staff flow, docs/modules.md
    // Phase 5) — never a bare userId with no membership here, and never a
    // user from another school (multi-tenancy, docs/multi-tenancy.md §3).
    const membership = await this.prisma.schoolMembership.findFirst({
      where: { userId: input.userId, schoolId, status: 'ACTIVE', deletedAt: null },
    });
    if (!membership) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'This user is not an active staff member of this school.',
      });
    }

    const existing = await this.prisma.teacher.findFirst({
      where: { schoolId, userId: input.userId, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'This staff member already has a teacher profile.',
      });
    }

    const teacher = await this.prisma.teacher.create({
      data: {
        schoolId,
        userId: input.userId,
        employeeCode: input.employeeCode || null,
        joiningDate: input.joiningDate ? new Date(input.joiningDate) : null,
      },
      include: { user: true },
    });
    return this.toDto(teacher);
  }

  async update(schoolId: string, teacherId: string, input: UpdateTeacherInput) {
    const existing = await this.prisma.teacher.findFirst({
      where: { id: teacherId, schoolId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }

    const teacher = await this.prisma.teacher.update({
      where: { id: teacherId },
      data: {
        ...(input.employeeCode !== undefined ? { employeeCode: input.employeeCode || null } : {}),
        ...(input.joiningDate !== undefined
          ? { joiningDate: input.joiningDate ? new Date(input.joiningDate) : null }
          : {}),
      },
      include: { user: true },
    });
    return this.toDto(teacher);
  }

  async listAssignments(schoolId: string, teacherId: string) {
    const teacher = await this.prisma.teacher.findFirst({ where: { id: teacherId, schoolId, deletedAt: null } });
    if (!teacher) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }

    return this.prisma.teacherAssignment.findMany({
      where: { teacherId, schoolId, deletedAt: null },
      include: { section: { include: { class: true } }, subject: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createAssignment(schoolId: string, teacherId: string, input: CreateTeacherAssignmentInput) {
    const teacher = await this.prisma.teacher.findFirst({ where: { id: teacherId, schoolId, deletedAt: null } });
    if (!teacher) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }

    const [section, subject] = await Promise.all([
      this.prisma.section.findFirst({ where: { id: input.sectionId, schoolId, deletedAt: null } }),
      this.prisma.subject.findFirst({ where: { id: input.subjectId, schoolId, deletedAt: null } }),
    ]);
    if (!section || !subject) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown section or subject.' });
    }

    const existing = await this.prisma.teacherAssignment.findFirst({
      where: { teacherId, sectionId: input.sectionId, subjectId: input.subjectId, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'This teacher is already assigned to that section and subject.',
      });
    }

    return this.prisma.teacherAssignment.create({
      data: { schoolId, teacherId, sectionId: input.sectionId, subjectId: input.subjectId },
      include: { section: { include: { class: true } }, subject: true },
    });
  }

  async removeAssignment(schoolId: string, teacherId: string, assignmentId: string) {
    const assignment = await this.prisma.teacherAssignment.findFirst({
      where: { id: assignmentId, teacherId, schoolId, deletedAt: null },
    });
    if (!assignment) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }

    await this.prisma.teacherAssignment.update({ where: { id: assignmentId }, data: { deletedAt: new Date() } });
    return { id: assignmentId };
  }

  private toDto(teacher: {
    id: string;
    employeeCode: string | null;
    joiningDate: Date | null;
    user: { id: string; email: string; firstName: string; lastName: string };
  }) {
    return {
      id: teacher.id,
      employeeCode: teacher.employeeCode,
      joiningDate: teacher.joiningDate,
      user: {
        id: teacher.user.id,
        email: teacher.user.email,
        firstName: teacher.user.firstName,
        lastName: teacher.user.lastName,
      },
    };
  }
}
