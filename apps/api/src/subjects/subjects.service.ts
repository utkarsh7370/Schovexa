import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSubjectInput, UpdateSubjectInput } from '@schovexa/validation';
import { DepartmentsService } from '../departments/departments.service';

@Injectable()
export class SubjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departments: DepartmentsService,
  ) {}

  async list(schoolId: string) {
    return this.prisma.subject.findMany({
      where: { schoolId, deletedAt: null },
      include: { department: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async create(schoolId: string, input: CreateSubjectInput) {
    const existing = await this.prisma.subject.findFirst({
      where: { schoolId, name: input.name, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'A subject with this name already exists.',
      });
    }

    const departmentId = await this.departments.resolveId(schoolId, input.departmentId);
    return this.prisma.subject.create({
      data: { schoolId, name: input.name, code: input.code || null, departmentId: departmentId ?? null },
      include: { department: { select: { id: true, name: true } } },
    });
  }

  async update(schoolId: string, subjectId: string, input: UpdateSubjectInput) {
    const existing = await this.prisma.subject.findFirst({
      where: { id: subjectId, schoolId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }

    const departmentId = await this.departments.resolveId(schoolId, input.departmentId);
    return this.prisma.subject.update({
      where: { id: subjectId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code || null } : {}),
        ...(departmentId !== undefined ? { departmentId } : {}),
      },
      include: { department: { select: { id: true, name: true } } },
    });
  }
}
