import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateParentInput } from '@schovexa/validation';

@Injectable()
export class ParentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(schoolId: string) {
    return this.prisma.parent.findMany({
      where: { schoolId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  // A Parent profile is a standalone contact record (firstName/lastName/
  // phone/email of its own) — it does NOT require an existing portal
  // User, unlike a Teacher profile. Most schools record parent contact
  // details without ever giving every parent a login; Parent.userId
  // (nullable, docs/database.md §5) stays unset until a later phase
  // wires up inviting a parent to the portal.
  async create(schoolId: string, input: CreateParentInput) {
    return this.prisma.parent.create({
      data: {
        schoolId,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone || null,
        email: input.email || null,
      },
    });
  }
}
