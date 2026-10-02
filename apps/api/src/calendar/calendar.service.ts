import { BadRequestException, Injectable } from '@nestjs/common';
import { ISO_DATE, dateOnlyToIso, todayInTimezone } from '../common/dates.util';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolSettingsService } from '../school-settings/school-settings.service';

const MAX_RANGE_DAYS = 100;
const DAY_MS = 86_400_000;

// The school calendar: for each day in a range, whether it is a teaching
// day (and if not, why), plus the holidays, terms and academic years that
// overlap it. Built from the same week rules attendance enforces.
@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SchoolSettingsService,
  ) {}

  async range(schoolId: string, fromInput?: string, toInput?: string) {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timezone: true } });
    const today = todayInTimezone(school.timezone);
    const from = fromInput ?? `${today.slice(0, 7)}-01`;
    const to = toInput ?? this.endOfMonth(from);
    for (const [label, value] of [['from', from], ['to', to]] as const) {
      if (!ISO_DATE.test(value) || Number.isNaN(new Date(value).getTime())) {
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: `“${label}” must be a date like 2026-10-01.` });
      }
    }
    if (to < from) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '“to” can’t be before “from”.' });
    if ((new Date(to).getTime() - new Date(from).getTime()) / DAY_MS > MAX_RANGE_DAYS) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: `Ask for at most ${MAX_RANGE_DAYS} days at a time.` });
    }

    const settings = await this.settings.get(schoolId);
    const [days, terms, years] = await Promise.all([
      this.settings.dayStatuses(schoolId, from, to, settings),
      this.prisma.academicTerm.findMany({
        where: { schoolId, deletedAt: null, startDate: { lte: new Date(to) }, endDate: { gte: new Date(from) }, academicYear: { deletedAt: null } },
        include: { academicYear: { select: { id: true, name: true } } },
        orderBy: { startDate: 'asc' },
      }),
      this.prisma.academicYear.findMany({
        where: { schoolId, deletedAt: null, status: { in: ['APPROVED', 'EXPIRED'] }, startDate: { lte: new Date(to) }, endDate: { gte: new Date(from) } },
        orderBy: { startDate: 'asc' },
      }),
    ]);

    return {
      today,
      from,
      to,
      rules: { workingDays: settings.workingDays, offSaturdays: settings.offSaturdays },
      timings: {
        schoolStartTime: settings.schoolStartTime,
        schoolEndTime: settings.schoolEndTime,
        breakStartTime: settings.breakStartTime,
        breakEndTime: settings.breakEndTime,
      },
      summary: {
        workingDays: days.filter((d) => d.working).length,
        holidays: days.filter((d) => d.reason === 'HOLIDAY').length,
        weeklyOff: days.filter((d) => d.reason === 'WEEKLY_OFF' || d.reason === 'OFF_SATURDAY').length,
      },
      days,
      terms: terms.map((t) => ({
        id: t.id,
        name: t.name,
        startDate: dateOnlyToIso(t.startDate),
        endDate: dateOnlyToIso(t.endDate),
        academicYear: t.academicYear,
      })),
      years: years.map((y) => ({
        id: y.id,
        name: y.name,
        startDate: y.startDate.toISOString().slice(0, 10),
        endDate: y.endDate.toISOString().slice(0, 10),
        isCurrent: y.isCurrent,
      })),
    };
  }

  private endOfMonth(firstOfMonth: string): string {
    const [y, m] = firstOfMonth.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  }
}
