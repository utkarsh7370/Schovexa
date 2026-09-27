import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import type { SessionContext } from '../../auth/auth.service';
import type { AuthContext } from '../authorization.types';

// Step 3 of the tenant-resolution pipeline (docs/architecture.md §3,
// docs/multi-tenancy.md §2): resolves the session's active membership and
// RE-VERIFIES it against the database on every request — never trusts a
// value cached on the session row beyond the raw membership id. Runs
// after AuthGuard (which must have already attached request.session).
@Injectable()
export class SchoolContextGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { session?: SessionContext; authContext?: AuthContext }>();
    const session = request.session;

    if (!session) {
      // AuthGuard did not run first — a route wiring mistake, not a
      // tenant-isolation scenario.
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'No session context available.' });
    }

    if (!session.activeMembershipId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'No active school selected for this session.',
      });
    }

    const membership = await this.prisma.schoolMembership.findFirst({
      where: {
        id: session.activeMembershipId,
        userId: session.userId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: { school: true },
    });

    if (!membership || membership.school.status !== 'ACTIVE' || membership.school.deletedAt) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Your access to this school is not currently active.',
      });
    }

    request.authContext = {
      userId: session.userId,
      schoolId: membership.schoolId,
      membershipId: membership.id,
      roleId: membership.roleId,
    };

    return true;
  }
}
