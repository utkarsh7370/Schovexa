import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateFeeStructureInput } from '@schovexa/validation';

@Injectable()
export class FeeStructuresService {
  constructor(private readonly prisma: PrismaService) {}

  async list(schoolId: string, academicYearId?: string) {
    return this.prisma.feeStructure.findMany({
      where: { schoolId, deletedAt: null, ...(academicYearId ? { academicYearId } : {}) },
      include: { feeCategory: true, class: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(schoolId: string, input: CreateFeeStructureInput) {
    const [category, academicYear] = await Promise.all([
      this.prisma.feeCategory.findFirst({ where: { id: input.feeCategoryId, schoolId, deletedAt: null } }),
      this.prisma.academicYear.findFirst({ where: { id: input.academicYearId, schoolId, deletedAt: null } }),
    ]);
    if (!category || !academicYear) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown fee category or academic year.' });
    }

    let classId: string | null = null;
    if (input.classId) {
      const klass = await this.prisma.class.findFirst({ where: { id: input.classId, schoolId, deletedAt: null } });
      if (!klass) {
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown class.' });
      }
      classId = klass.id;
    }

    return this.prisma.feeStructure.create({
      data: {
        schoolId,
        feeCategoryId: input.feeCategoryId,
        academicYearId: input.academicYearId,
        classId,
        amountMinor: input.amountMinor,
        frequency: input.frequency,
      },
      include: { feeCategory: true, class: true },
    });
  }

  // Assigns this structure's amount as a StudentFee to every currently
  // enrolled student in its class (or every enrolled student in the
  // school, if the structure applies to no specific class) — skipping
  // any student already assigned this exact structure, so calling it
  // again after new admissions only picks up the newly added students.
  async assignToClass(schoolId: string, feeStructureId: string) {
    const structure = await this.prisma.feeStructure.findFirst({
      where: { id: feeStructureId, schoolId, deletedAt: null },
    });
    if (!structure) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }

    const students = await this.prisma.student.findMany({
      where: {
        schoolId,
        deletedAt: null,
        status: 'ENROLLED',
        ...(structure.classId ? { section: { classId: structure.classId } } : {}),
      },
      select: { id: true },
    });

    const existing = await this.prisma.studentFee.findMany({
      where: { schoolId, feeStructureId, studentId: { in: students.map((s) => s.id) } },
      select: { studentId: true },
    });
    const alreadyAssigned = new Set(existing.map((e) => e.studentId));
    const toAssign = students.filter((s) => !alreadyAssigned.has(s.id));

    if (toAssign.length > 0) {
      await this.prisma.studentFee.createMany({
        data: toAssign.map((s) => ({
          schoolId,
          studentId: s.id,
          feeStructureId,
          amountDueMinor: structure.amountMinor,
        })),
      });
    }

    return { assigned: toAssign.length, alreadyAssigned: alreadyAssigned.size };
  }
}
