import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntryInput {
  schoolId?: string | null;
  userId?: string | null;
  action: string;
  module: string;
  resourceType: string;
  resourceId: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}

// Single write path to AuditLog, used by every module that performs a
// sensitive action (docs/database.md §9, docs/authorization.md). Never
// pass secrets/tokens/passwords in `metadata` — this service does not
// scrub the payload itself, so callers are responsible, matching the
// redaction discipline in docs/logging.md §4.
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntryInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        schoolId: entry.schoolId ?? null,
        userId: entry.userId ?? null,
        action: entry.action,
        module: entry.module,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        metadata: entry.metadata,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  }
}
