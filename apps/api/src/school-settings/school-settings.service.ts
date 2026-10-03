import { BadRequestException, Injectable } from '@nestjs/common';
import type { SchoolSettings } from '@prisma/client';
import type { UpdateSchoolSettingsInput } from '@schovexa/validation';
import { PrismaService } from '../prisma/prisma.service';
import { classifyDay, eachDay, type DayStatus } from '../common/school-calendar.util';

// What a school gets before it has saved any settings. Mirrors the column
// defaults in schema.prisma, so reading never has to write a row.
export const DEFAULT_SETTINGS = {
  schoolStartTime: '08:00',
  schoolEndTime: '14:30',
  breakStartTime: '11:00' as string | null,
  breakEndTime: '11:30' as string | null,
  workingDays: [1, 2, 3, 4, 5, 6],
  offSaturdays: [] as number[],
  attendanceEditWindowDays: 0,
  attendanceMinPercent: 75,
  attendanceOnNonWorkingDays: false,
  receiptPrefix: '',
  allowPartialPayments: true,
  lateFeePerDayMinor: 0,
  lateFeeGraceDays: 0,
  passPercent: 40,
  teachersSeeParentContact: false,
  shareRemarksWithParents: false,
  teacherDocumentCategories: [] as string[],
  leaveAllowances: { CASUAL: 12, SICK: 10, EARNED: 15 } as { CASUAL: number; SICK: number; EARNED: number },
  maxDiscountPercent: 5,
  paymentCorrectionWindowDays: 2,
  notifyPaymentReceipt: true,
  notifyAbsenceEmail: true,
  notifyYearApprovalEmail: true,
  notifyStaffAttendanceDecisions: true,
  documentMaxSizeMb: 10,
  allowedDocumentTypes: ['application/pdf', 'image/jpeg', 'image/png'],
  documentCategories: ['ID proof', 'Birth certificate', 'Transfer certificate', 'Address proof', 'Medical record', 'Certificate', 'Other'],
  requiredStudentDocuments: [] as string[],
};

export type EffectiveSettings = typeof DEFAULT_SETTINGS;

const FIELDS = Object.keys(DEFAULT_SETTINGS) as (keyof EffectiveSettings)[];

function pick(row: SchoolSettings): EffectiveSettings {
  return Object.fromEntries(FIELDS.map((f) => [f, row[f]])) as EffectiveSettings;
}

@Injectable()
export class SchoolSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The school's settings, or the defaults if it has never saved any. */
  async get(schoolId: string): Promise<EffectiveSettings> {
    const row = await this.prisma.schoolSettings.findUnique({ where: { schoolId } });
    return row ? pick(row) : { ...DEFAULT_SETTINGS };
  }

  async update(schoolId: string, input: UpdateSchoolSettingsInput): Promise<EffectiveSettings> {
    const current = await this.get(schoolId);
    const next = { ...current, ...input } as EffectiveSettings;

    // The schema only sees the fields in this request, so check the result.
    if (next.schoolEndTime <= next.schoolStartTime) {
      throw this.invalid('schoolEndTime', 'The school day must end after it starts.');
    }
    if (next.breakStartTime && next.breakEndTime) {
      if (next.breakEndTime <= next.breakStartTime) throw this.invalid('breakEndTime', 'The break must end after it starts.');
      if (next.breakStartTime < next.schoolStartTime || next.breakEndTime > next.schoolEndTime) {
        throw this.invalid('breakStartTime', 'The break must fall within the school day.');
      }
    } else if (Boolean(next.breakStartTime) !== Boolean(next.breakEndTime)) {
      throw this.invalid('breakEndTime', 'Set both break times, or neither.');
    }
    const missing = next.requiredStudentDocuments.filter((c) => !next.documentCategories.some((d) => d.toLowerCase() === c.toLowerCase()));
    if (missing.length > 0) {
      throw this.invalid('requiredStudentDocuments', `“${missing[0]}” is required but isn’t one of the document categories.`);
    }

    const unknown = next.teacherDocumentCategories.find((c) => !next.documentCategories.some((d) => d.toLowerCase() === c.toLowerCase()));
    if (unknown) throw this.invalid('teacherDocumentCategories', `“${unknown}” isn’t one of the document categories.`);

    const data = { ...input, workingDays: input.workingDays ? [...input.workingDays].sort((a, b) => a - b) : undefined };
    const row = await this.prisma.schoolSettings.upsert({
      where: { schoolId },
      create: { schoolId, ...data },
      update: data,
    });
    return pick(row);
  }

  /** Is each day from `from` to `to` a teaching day? Holidays are looked up once for the whole range. */
  async dayStatuses(schoolId: string, from: string, to: string, settings?: EffectiveSettings): Promise<DayStatus[]> {
    const rules = settings ?? (await this.get(schoolId));
    const holidays = await this.prisma.holiday.findMany({
      where: { schoolId, deletedAt: null, startDate: { lte: new Date(to) }, endDate: { gte: new Date(from) } },
      orderBy: { startDate: 'asc' },
    });
    return eachDay(from, to).map((day) =>
      classifyDay(
        day,
        rules,
        holidays
          .filter((h) => h.startDate.toISOString().slice(0, 10) <= day && h.endDate.toISOString().slice(0, 10) >= day)
          .map((h) => ({ id: h.id, name: h.name, type: h.type })),
      ),
    );
  }

  private invalid(field: string, message: string) {
    return new BadRequestException({ code: 'VALIDATION_FAILED', message, details: [{ field, message }] });
  }
}
