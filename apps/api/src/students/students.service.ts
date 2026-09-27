import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateStudentInput, LinkParentInput, UpdateStudentInput } from '@schovexa/validation';

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(schoolId: string, filters: { sectionId?: string; status?: string }) {
    return this.prisma.student.findMany({
      where: {
        schoolId,
        deletedAt: null,
        ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
        ...(filters.status ? { status: filters.status as never } : {}),
      },
      orderBy: { admissionNo: 'asc' },
    });
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
      },
    });
  }

  async findOne(schoolId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId, deletedAt: null },
      include: {
        section: { include: { class: true } },
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
