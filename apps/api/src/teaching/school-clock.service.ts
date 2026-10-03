import { Injectable } from '@nestjs/common';
import { dateOnlyToIso, todayInTimezone } from '../common/dates.util';
import { PrismaService } from '../prisma/prisma.service';

/** The school's own calendar: "today" is the school's day, not the server's or the browser's. */
@Injectable()
export class SchoolClockService {
  constructor(private readonly prisma: PrismaService) {}

  async timezone(schoolId: string): Promise<string | null> {
    const school = await this.prisma.school.findUnique({ where: { id: schoolId }, select: { timezone: true } });
    return school?.timezone ?? null;
  }

  /** Today as 2026-10-03 in the school's time zone. */
  async today(schoolId: string): Promise<string> {
    return todayInTimezone(await this.timezone(schoolId));
  }

  /** ISO weekday (1 = Monday … 7 = Sunday) of a YYYY-MM-DD date. */
  static weekday(iso: string): number {
    const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
    return d === 0 ? 7 : d;
  }

  static shift(iso: string, days: number): string {
    return dateOnlyToIso(new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000));
  }
}
