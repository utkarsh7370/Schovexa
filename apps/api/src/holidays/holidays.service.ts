import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateHolidayInput, UpdateHolidayInput } from '@schovexa/validation';
import { PrismaService } from '../prisma/prisma.service';
import { dateOnlyToIso, todayInTimezone } from '../common/dates.util';

const DAY_MS = 24 * 60 * 60 * 1000;

type HolidayRow = {
  id: string;
  name: string;
  type: string;
  startDate: Date;
  endDate: Date;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// DATE columns come back as UTC-midnight Dates; the API speaks plain
// YYYY-MM-DD strings so no client ever re-interprets them in its own zone.
function serialize(h: HolidayRow) {
  return {
    id: h.id,
    name: h.name,
    type: h.type,
    startDate: dateOnlyToIso(h.startDate),
    endDate: dateOnlyToIso(h.endDate),
    description: h.description,
    createdAt: h.createdAt,
    updatedAt: h.updatedAt,
  };
}

@Injectable()
export class HolidaysService {
  constructor(private readonly prisma: PrismaService) {}

  async list(schoolId: string) {
    const holidays = await this.prisma.holiday.findMany({
      where: { schoolId, deletedAt: null },
      orderBy: [{ startDate: 'asc' }, { name: 'asc' }],
    });
    return holidays.map(serialize);
  }

  /**
   * The holiday to show on the dashboard: one happening today, otherwise
   * the nearest one still ahead. "Today" is the school's own date, which
   * is returned too so the UI can label every other holiday against the
   * same day rather than the browser's.
   */
  async next(schoolId: string) {
    const school = await this.prisma.school.findUnique({ where: { id: schoolId }, select: { timezone: true } });
    const today = todayInTimezone(school?.timezone);
    const holiday = await this.prisma.holiday.findFirst({
      where: { schoolId, deletedAt: null, endDate: { gte: new Date(today) } },
      orderBy: [{ startDate: 'asc' }, { name: 'asc' }],
    });
    if (!holiday) return { today, holiday: null, daysUntil: null, ongoing: false };

    const startIso = dateOnlyToIso(holiday.startDate);
    const ongoing = startIso <= today;
    const daysUntil = ongoing ? 0 : Math.round((new Date(startIso).getTime() - new Date(today).getTime()) / DAY_MS);
    return { today, holiday: serialize(holiday), daysUntil, ongoing };
  }

  async create(schoolId: string, createdById: string, input: CreateHolidayInput) {
    const holiday = await this.prisma.holiday.create({
      data: {
        schoolId,
        createdById,
        name: input.name,
        type: input.type ?? 'OTHER',
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        description: input.description || null,
      },
    });
    return serialize(holiday);
  }

  async update(schoolId: string, id: string, input: UpdateHolidayInput) {
    const existing = await this.findOwn(schoolId, id);

    // A partial update must still leave a valid range (end >= start),
    // judged against the values it does not touch.
    const startIso = input.startDate ?? dateOnlyToIso(existing.startDate);
    const endIso = input.endDate ?? dateOnlyToIso(existing.endDate);
    if (endIso < startIso) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'The end date can’t be before the start date.' });
    }

    const holiday = await this.prisma.holiday.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.startDate !== undefined ? { startDate: new Date(input.startDate) } : {}),
        ...(input.endDate !== undefined ? { endDate: new Date(input.endDate) } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
      },
    });
    return serialize(holiday);
  }

  async remove(schoolId: string, id: string) {
    await this.findOwn(schoolId, id);
    await this.prisma.holiday.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id };
  }

  private async findOwn(schoolId: string, id: string) {
    const holiday = await this.prisma.holiday.findFirst({ where: { id, schoolId, deletedAt: null } });
    if (!holiday) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }
    return holiday;
  }
}
