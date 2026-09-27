import { BadRequestException, NotFoundException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateAcademicYearInput } from '@schovexa/validation';

@Injectable()
export class AcademicYearsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(schoolId: string) {
    return this.prisma.academicYear.findMany({
      where: { schoolId, deletedAt: null },
      orderBy: { startDate: 'desc' },
    });
  }

  async create(schoolId: string, input: CreateAcademicYearInput) {
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Invalid start or end date.' });
    }
    if (endDate <= startDate) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'End date must be after start date.' });
    }

    const existing = await this.prisma.academicYear.findFirst({
      where: { schoolId, name: input.name, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'An academic year with this name already exists.',
      });
    }

    // First academic year for a school is automatically current — a
    // school with academic years but none marked current is a confusing
    // state nothing else in the product expects.
    const isFirst = (await this.prisma.academicYear.count({ where: { schoolId, deletedAt: null } })) === 0;

    return this.prisma.academicYear.create({
      data: { schoolId, name: input.name, startDate, endDate, isCurrent: isFirst },
    });
  }

  async setCurrent(schoolId: string, academicYearId: string) {
    const year = await this.prisma.academicYear.findFirst({
      where: { id: academicYearId, schoolId, deletedAt: null },
    });
    if (!year) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }

    await this.prisma.$transaction([
      this.prisma.academicYear.updateMany({ where: { schoolId }, data: { isCurrent: false } }),
      this.prisma.academicYear.update({ where: { id: academicYearId }, data: { isCurrent: true } }),
    ]);

    return this.prisma.academicYear.findUniqueOrThrow({ where: { id: academicYearId } });
  }
}
