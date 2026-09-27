import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSubjectInput, UpdateSubjectInput } from '@schovexa/validation';

@Injectable()
export class SubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(schoolId: string) {
    return this.prisma.subject.findMany({
      where: { schoolId, deletedAt: null },
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

    return this.prisma.subject.create({
      data: { schoolId, name: input.name, code: input.code || null },
    });
  }

  async update(schoolId: string, subjectId: string, input: UpdateSubjectInput) {
    const existing = await this.prisma.subject.findFirst({
      where: { id: subjectId, schoolId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }

    return this.prisma.subject.update({
      where: { id: subjectId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code || null } : {}),
      },
    });
  }
}
