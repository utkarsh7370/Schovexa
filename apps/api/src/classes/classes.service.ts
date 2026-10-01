import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { assertYearOpenForChanges } from '../academic-years/academic-year-rules';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateClassInput, UpdateClassInput } from '@schovexa/validation';

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(schoolId: string, academicYearId?: string) {
    return this.prisma.class.findMany({
      where: { schoolId, deletedAt: null, ...(academicYearId ? { academicYearId } : {}) },
      orderBy: { order: 'asc' },
    });
  }

  async create(schoolId: string, input: CreateClassInput) {
    const academicYear = await this.prisma.academicYear.findFirst({
      where: { id: input.academicYearId, schoolId, deletedAt: null },
    });
    if (!academicYear) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown academic year.' });
    }
    await assertYearOpenForChanges(this.prisma, schoolId, academicYear);

    const existing = await this.prisma.class.findFirst({
      where: { academicYearId: input.academicYearId, name: input.name, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'A class with this name already exists for that academic year.',
      });
    }

    return this.prisma.class.create({
      data: { schoolId, academicYearId: input.academicYearId, name: input.name, order: input.order },
    });
  }

  async update(schoolId: string, classId: string, input: UpdateClassInput) {
    const existing = await this.prisma.class.findFirst({
      where: { id: classId, schoolId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }

    return this.prisma.class.update({
      where: { id: classId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.order !== undefined ? { order: input.order } : {}),
      },
    });
  }
}
