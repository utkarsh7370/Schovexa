import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSectionInput, UpdateSectionInput } from '@schovexa/validation';

@Injectable()
export class SectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForClass(schoolId: string, classId: string) {
    const klass = await this.prisma.class.findFirst({ where: { id: classId, schoolId, deletedAt: null } });
    if (!klass) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }

    return this.prisma.section.findMany({
      where: { classId, schoolId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async create(schoolId: string, classId: string, input: CreateSectionInput) {
    const klass = await this.prisma.class.findFirst({ where: { id: classId, schoolId, deletedAt: null } });
    if (!klass) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }

    const existing = await this.prisma.section.findFirst({
      where: { classId, name: input.name, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'A section with this name already exists for that class.',
      });
    }

    const classTeacherId = await this.resolveClassTeacherId(schoolId, input.classTeacherId);

    return this.prisma.section.create({
      data: { schoolId, classId, name: input.name, classTeacherId },
    });
  }

  async update(schoolId: string, sectionId: string, input: UpdateSectionInput) {
    const existing = await this.prisma.section.findFirst({
      where: { id: sectionId, schoolId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }

    const data: { name?: string; classTeacherId?: string | null } = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.classTeacherId !== undefined) {
      data.classTeacherId = await this.resolveClassTeacherId(schoolId, input.classTeacherId);
    }

    return this.prisma.section.update({ where: { id: sectionId }, data });
  }

  // '' (cleared select) resolves to null; a real id is verified to belong
  // to this school before it's ever written to another school's Section.
  private async resolveClassTeacherId(schoolId: string, classTeacherId: string | undefined): Promise<string | null> {
    if (!classTeacherId) return null;

    const teacher = await this.prisma.teacher.findFirst({
      where: { id: classTeacherId, schoolId, deletedAt: null },
    });
    if (!teacher) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown class teacher.' });
    }
    return teacher.id;
  }
}
