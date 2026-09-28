import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateFeeCategoryInput } from '@schovexa/validation';

@Injectable()
export class FeeCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(schoolId: string) {
    return this.prisma.feeCategory.findMany({
      where: { schoolId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async create(schoolId: string, input: CreateFeeCategoryInput) {
    const existing = await this.prisma.feeCategory.findFirst({
      where: { schoolId, name: input.name, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'A fee category with this name already exists.',
      });
    }

    return this.prisma.feeCategory.create({ data: { schoolId, name: input.name } });
  }
}
