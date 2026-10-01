import { BadRequestException } from '@nestjs/common';
import type { AcademicYear } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { dateOnlyToIso, todayInTimezone } from '../common/dates.util';

// Academic years are stored as full timestamps (midnight UTC of the
// calendar date the user picked); the calendar date is what matters.
export const isoDay = (date: Date): string => dateOnlyToIso(date);

/**
 * Classes and fee structures may only be added to a year that is approved
 * and has not ended. An expired year is read-only (its history stays
 * visible); a proposed year can't be used until the Director approves it.
 * Checks the date as well as the stored status so a year that ended last
 * night is closed even before anyone has re-opened the Academic Years page.
 */
export async function assertYearOpenForChanges(
  prisma: PrismaService,
  schoolId: string,
  year: Pick<AcademicYear, 'name' | 'status' | 'endDate'>,
): Promise<void> {
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { timezone: true } });
  const today = todayInTimezone(school?.timezone);
  if (year.status === 'EXPIRED' || (year.status === 'APPROVED' && isoDay(year.endDate) < today)) {
    throw new BadRequestException({
      code: 'ACADEMIC_YEAR_EXPIRED',
      message: `${year.name} has ended, so it is read-only. Use the current academic year instead.`,
    });
  }
  if (year.status !== 'APPROVED') {
    throw new BadRequestException({
      code: 'ACADEMIC_YEAR_NOT_APPROVED',
      message: `${year.name} hasn’t been approved yet. It can be used once the Director approves it.`,
    });
  }
}
