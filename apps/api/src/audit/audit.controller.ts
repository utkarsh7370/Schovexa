import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import type { AuthContext } from '../authorization/authorization.types';
import { buildPaginationMeta, parsePagination } from '../common/pagination.util';
import { describeDevice } from '../auth/device.util';
import { PrismaService } from '../prisma/prisma.service';

// The school's audit trail, for whoever holds audit.view (the Director).
// Read-only — nothing in the API edits or deletes an audit entry — and
// scoped to the active school: another school's entries, and people's own
// sign-in history (which belongs to them, not to any school), never appear.
@Controller('audit-logs')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission('audit.view')
  async list(
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @Query('action') action: string | undefined,
    @Query('module') module: string | undefined,
    @Query('userId') userId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('q') q: string | undefined,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    const { page: p, pageSize: ps } = parsePagination(page, pageSize);
    const date = (value: string | undefined, label: string) => {
      if (!value) return undefined;
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: `${label} must be a valid date.` });
      return d;
    };
    const fromDate = date(from, 'from');
    const toDate = date(to, 'to');
    if (toDate) toDate.setUTCHours(23, 59, 59, 999);
    const term = q?.trim().slice(0, 80);

    const where = {
      schoolId: auth.schoolId,
      ...(action ? { action } : {}),
      ...(module ? { module } : {}),
      ...(userId ? { userId } : {}),
      ...(fromDate || toDate ? { createdAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } } : {}),
      ...(term
        ? {
            OR: [
              { action: { contains: term, mode: 'insensitive' as const } },
              { resourceId: { contains: term, mode: 'insensitive' as const } },
              { actor: { OR: [{ firstName: { contains: term, mode: 'insensitive' as const } }, { lastName: { contains: term, mode: 'insensitive' as const } }, { email: { contains: term, mode: 'insensitive' as const } }] } },
            ],
          }
        : {}),
    };

    const [total, rows, modules] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * ps,
        take: ps,
      }),
      this.prisma.auditLog.findMany({ where: { schoolId: auth.schoolId }, distinct: ['module'], select: { module: true }, orderBy: { module: 'asc' } }),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        action: r.action,
        module: r.module,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        actor: r.actor ? { id: r.actor.id, name: `${r.actor.firstName} ${r.actor.lastName}`.trim(), email: r.actor.email } : null,
        ipAddress: r.ipAddress,
        device: r.userAgent ? describeDevice(r.userAgent).label : null,
        metadata: r.metadata,
      })),
      pagination: buildPaginationMeta(p, ps, total),
      modules: modules.map((m) => m.module),
    };
  }
}
