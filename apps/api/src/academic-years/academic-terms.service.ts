import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AcademicTerm } from '@prisma/client';
import type { CreateTermInput, UpdateTermInput } from '@schovexa/validation';
import { dateOnlyToIso } from '../common/dates.util';
import { PrismaService } from '../prisma/prisma.service';

function serialize(t: AcademicTerm) {
  return { id: t.id, academicYearId: t.academicYearId, name: t.name, startDate: dateOnlyToIso(t.startDate), endDate: dateOnlyToIso(t.endDate) };
}

// Terms (Term 1, Semester 2…) inside an academic year. They stay within the
// year's dates and never overlap each other.
@Injectable()
export class AcademicTermsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(schoolId: string, yearId: string) {
    await this.year(schoolId, yearId);
    const terms = await this.prisma.academicTerm.findMany({
      where: { schoolId, academicYearId: yearId, deletedAt: null },
      orderBy: { startDate: 'asc' },
    });
    return terms.map(serialize);
  }

  async create(schoolId: string, yearId: string, input: CreateTermInput) {
    const year = await this.year(schoolId, yearId);
    await this.assertFits(schoolId, year, input.startDate, input.endDate, input.name);
    const term = await this.prisma.academicTerm.create({
      data: { schoolId, academicYearId: yearId, name: input.name, startDate: new Date(input.startDate), endDate: new Date(input.endDate) },
    });
    return serialize(term);
  }

  async update(schoolId: string, yearId: string, termId: string, input: UpdateTermInput) {
    const year = await this.year(schoolId, yearId);
    const existing = await this.term(schoolId, yearId, termId);
    const start = input.startDate ?? dateOnlyToIso(existing.startDate);
    const end = input.endDate ?? dateOnlyToIso(existing.endDate);
    if (end < start) throw this.invalid('endDate', 'The end date can’t be before the start date.');
    await this.assertFits(schoolId, year, start, end, input.name ?? existing.name, termId);
    const term = await this.prisma.academicTerm.update({
      where: { id: termId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        startDate: new Date(start),
        endDate: new Date(end),
      },
    });
    return serialize(term);
  }

  async remove(schoolId: string, yearId: string, termId: string) {
    await this.year(schoolId, yearId);
    await this.term(schoolId, yearId, termId);
    await this.prisma.academicTerm.update({ where: { id: termId }, data: { deletedAt: new Date() } });
    return { id: termId };
  }

  private async year(schoolId: string, yearId: string) {
    const year = await this.prisma.academicYear.findFirst({ where: { id: yearId, schoolId, deletedAt: null } });
    if (!year) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    return year;
  }

  private async term(schoolId: string, yearId: string, termId: string) {
    const term = await this.prisma.academicTerm.findFirst({ where: { id: termId, schoolId, academicYearId: yearId, deletedAt: null } });
    if (!term) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    return term;
  }

  private async assertFits(schoolId: string, year: { id: string; startDate: Date; endDate: Date; name: string }, start: string, end: string, name: string, ignoreId?: string) {
    const yearStart = year.startDate.toISOString().slice(0, 10);
    const yearEnd = year.endDate.toISOString().slice(0, 10);
    if (start < yearStart || end > yearEnd) {
      throw this.invalid('startDate', `A term must fall within ${year.name} (${yearStart} to ${yearEnd}).`);
    }
    const others = await this.prisma.academicTerm.findMany({
      where: { schoolId, academicYearId: year.id, deletedAt: null, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    });
    const sameYear = others.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (sameYear) throw this.invalid('name', `There is already a term called “${sameYear.name}” in this year.`);
    const clash = others.find((t) => dateOnlyToIso(t.startDate) <= end && dateOnlyToIso(t.endDate) >= start);
    if (clash) throw this.invalid('startDate', `This overlaps “${clash.name}” (${dateOnlyToIso(clash.startDate)} to ${dateOnlyToIso(clash.endDate)}).`);
  }

  private invalid(field: string, message: string) {
    return new BadRequestException({ code: 'VALIDATION_FAILED', message, details: [{ field, message }] });
  }
}
