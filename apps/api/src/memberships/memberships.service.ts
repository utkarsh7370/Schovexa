import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { AuthService, RequestMeta } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateInvitationInput } from '@schovexa/validation';

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly audit: AuditService,
  ) {}

  async listMemberships(schoolId: string) {
    const memberships = await this.prisma.schoolMembership.findMany({
      where: { schoolId, deletedAt: null },
      include: { user: true, role: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      membershipId: m.id,
      status: m.status,
      user: {
        id: m.user.id,
        email: m.user.email,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        status: m.user.status,
      },
      role: { id: m.role.id, name: m.role.name },
    }));
  }

  /**
   * Returns the raw invite token in the response too, even though
   * AuthService.createInvitation() also emails it when SMTP is
   * configured — the inviting admin (who already holds `user.create`)
   * can then share the link directly as a fallback (SMTP unconfigured,
   * delivery failure, etc.). This token must never be logged
   * (docs/logging.md §4) — it only ever appears in this one HTTP
   * response body, to the one caller authorized to create it.
   */
  async createInvitation(schoolId: string, input: CreateInvitationInput, meta: RequestMeta) {
    const role = await this.prisma.role.findFirst({
      where: { id: input.roleId, schoolId, deletedAt: null },
    });
    if (!role) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown role for this school.' });
    }

    const { rawToken, userId } = await this.authService.createInvitation({
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      schoolId,
      roleId: input.roleId,
    });

    await this.audit.record({
      schoolId,
      userId,
      action: 'user.invite_created',
      module: 'user',
      resourceType: 'User',
      resourceId: userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { userId, inviteToken: rawToken };
  }

  async updateMembership(schoolId: string, membershipId: string, roleId: string | undefined, meta: RequestMeta) {
    const membership = await this.prisma.schoolMembership.findFirst({
      where: { id: membershipId, schoolId, deletedAt: null },
    });
    if (!membership) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }

    if (roleId) {
      const role = await this.prisma.role.findFirst({ where: { id: roleId, schoolId, deletedAt: null } });
      if (!role) {
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown role for this school.' });
      }
      await this.prisma.schoolMembership.update({ where: { id: membershipId }, data: { roleId } });
      await this.audit.record({
        schoolId,
        userId: membership.userId,
        action: 'user.role_changed',
        module: 'user',
        resourceType: 'SchoolMembership',
        resourceId: membershipId,
        metadata: { newRoleId: roleId },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    }

    return this.prisma.schoolMembership.findUniqueOrThrow({
      where: { id: membershipId },
      include: { user: true, role: true },
    });
  }

  async setMembershipStatus(
    schoolId: string,
    membershipId: string,
    status: typeof MembershipStatus.DISABLED | typeof MembershipStatus.ACTIVE,
    meta: RequestMeta,
  ) {
    const membership = await this.prisma.schoolMembership.findFirst({
      where: { id: membershipId, schoolId, deletedAt: null },
    });
    if (!membership) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }

    await this.prisma.schoolMembership.update({ where: { id: membershipId }, data: { status } });
    await this.audit.record({
      schoolId,
      userId: membership.userId,
      action: status === 'DISABLED' ? 'user.disable' : 'user.reactivate',
      module: 'user',
      resourceType: 'SchoolMembership',
      resourceId: membershipId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { membershipId, status };
  }
}
