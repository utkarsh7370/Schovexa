import { Injectable } from '@nestjs/common';
import { DEFAULT_GRADE_BANDS, gradeForPercent } from '@schovexa/validation';
import type { ReplaceGradingInput } from '@schovexa/validation';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolSettingsService } from '../school-settings/school-settings.service';

// The school's grade scale: percentage bands (A+ from 90%, …) and the pass
// mark. A school that has never configured one gets the default scale,
// returned without writing anything.
@Injectable()
export class GradingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SchoolSettingsService,
  ) {}

  async get(schoolId: string) {
    const [settings, rows] = await Promise.all([
      this.settings.get(schoolId),
      this.prisma.gradeBand.findMany({ where: { schoolId }, orderBy: { minPercent: 'desc' } }),
    ]);
    const bands = rows.length > 0
      ? rows.map((b) => ({ label: b.label, minPercent: b.minPercent, gradePoint: b.gradePoint, remark: b.remark ?? '' }))
      : DEFAULT_GRADE_BANDS.map((b) => ({ ...b }));
    return { passPercent: settings.passPercent, bands, isDefault: rows.length === 0 };
  }

  async replace(schoolId: string, input: ReplaceGradingInput) {
    const bands = input.bands;
    await this.prisma.$transaction([
      this.prisma.gradeBand.deleteMany({ where: { schoolId } }),
      this.prisma.gradeBand.createMany({
        data: bands.map((b) => ({ schoolId, label: b.label, minPercent: b.minPercent, gradePoint: b.gradePoint ?? null, remark: b.remark || null })),
      }),
      this.prisma.schoolSettings.upsert({
        where: { schoolId },
        create: { schoolId, passPercent: input.passPercent },
        update: { passPercent: input.passPercent },
      }),
    ]);
    return this.get(schoolId);
  }

  /** What a percentage earns on this school's scale — for report cards and the "try it" box. */
  async preview(schoolId: string, percent: number) {
    const { bands, passPercent } = await this.get(schoolId);
    const band = gradeForPercent(bands, percent);
    return band ? { percent, label: band.label, gradePoint: band.gradePoint, remark: band.remark, passed: percent >= passPercent } : null;
  }
}
