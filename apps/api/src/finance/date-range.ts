import { BadRequestException } from '@nestjs/common';
import { ISO_DATE, localDayRange } from '../common/dates.util';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * A "from" / "to" pair of school-local dates (2026-10-01) as real instants, for
 * filtering a timestamp column. Either end may be left out. A school's "1 October"
 * runs from midnight to midnight in the school's own time zone, not UTC.
 */
export async function schoolDateRange(prisma: PrismaService, schoolId: string, from?: string, to?: string): Promise<{ gte?: Date; lte?: Date }> {
  for (const [label, value] of [['from', from], ['to', to]] as const) {
    if (value && (!ISO_DATE.test(value) || Number.isNaN(new Date(value).getTime()))) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: `“${label}” must be a date like 2026-10-01.` });
    }
  }
  if (from && to && to < from) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '“to” can’t be before “from”.' });
  if (!from && !to) return {};
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timezone: true } });
  return {
    ...(from ? { gte: localDayRange(school.timezone, from).start } : {}),
    ...(to ? { lte: localDayRange(school.timezone, to).end } : {}),
  };
}
