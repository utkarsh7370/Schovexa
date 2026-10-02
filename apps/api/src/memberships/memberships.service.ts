import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { AuthService, RequestMeta } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';
import type { AuthContext } from '../authorization/authorization.types';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateInvitationInput } from '@schovexa/validation';

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly audit: AuditService,
    private readonly authorization: AuthorizationService,
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
   * Invites someone to the school. The invite link is returned to the admin
   * too (a fallback for when email can't be delivered) — it only ever lets
   * the INVITED person set their own first password, and never works on an
   * account that already has one, so it can't be used to take over an
   * existing user. `inviteToken` is null when the email already belongs to
   * an active account: that person is simply added to the school.
   *
   * Inviting is a sensitive action and can't escalate: you can only assign a
   * role whose permissions you hold yourself.
   */
  async createInvitation(auth: AuthContext, input: CreateInvitationInput, meta: RequestMeta) {
    const role = await this.prisma.role.findFirst({
      where: { id: input.roleId, schoolId: auth.schoolId, deletedAt: null },
    });
    if (!role) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown role for this school.' });
    }
    await this.authorization.assertCanAssignRole(auth.roleId, role.id);

    const { rawToken, userId, existingAccount } = await this.authService.createInvitation({
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      schoolId: auth.schoolId,
      roleId: input.roleId,
    });

    await this.audit.record({
      schoolId: auth.schoolId,
      userId: auth.userId, // who did it — not who it was done to
      action: 'user.invite_created',
      module: 'user',
      resourceType: 'User',
      resourceId: userId,
      metadata: { email: input.email, role: role.name, existingAccount },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { userId, inviteToken: rawToken, existingAccount };
  }

  /** Is this the school's only active Director? Taking their access away would leave nobody in charge. */
  private async isLastActiveDirector(schoolId: string, membership: { id: string; role: { name: string; isSystem: boolean } }): Promise<boolean> {
    if (!(membership.role.isSystem && membership.role.name === 'Director')) return false;
    const others = await this.prisma.schoolMembership.count({
      where: { schoolId, id: { not: membership.id }, status: 'ACTIVE', deletedAt: null, role: { name: 'Director', isSystem: true } },
    });
    return others === 0;
  }

  async updateMembership(auth: AuthContext, membershipId: string, roleId: string | undefined, meta: RequestMeta) {
    const schoolId = auth.schoolId;
    const membership = await this.prisma.schoolMembership.findFirst({
      where: { id: membershipId, schoolId, deletedAt: null },
      include: { role: true },
    });
    if (!membership) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }

    if (roleId && roleId !== membership.roleId) {
      const role = await this.prisma.role.findFirst({ where: { id: roleId, schoolId, deletedAt: null } });
      if (!role) {
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown role for this school.' });
      }
      await this.authorization.assertCanAssignRole(auth.roleId, role.id);
      if (await this.isLastActiveDirector(schoolId, membership)) {
        throw new BadRequestException({
          code: 'LAST_DIRECTOR',
          message: 'This is the school’s only Director. Make someone else a Director first.',
        });
      }
      await this.prisma.schoolMembership.update({ where: { id: membershipId }, data: { roleId } });
      await this.audit.record({
        schoolId,
        userId: auth.userId,
        action: 'user.role_changed',
        module: 'user',
        resourceType: 'SchoolMembership',
        resourceId: membershipId,
        metadata: { targetUserId: membership.userId, fromRole: membership.role.name, newRoleId: roleId },
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
    auth: AuthContext,
    membershipId: string,
    status: typeof MembershipStatus.DISABLED | typeof MembershipStatus.ACTIVE,
    meta: RequestMeta,
  ) {
    const schoolId = auth.schoolId;
    const membership = await this.prisma.schoolMembership.findFirst({
      where: { id: membershipId, schoolId, deletedAt: null },
      include: { role: true },
    });
    if (!membership) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }

    if (status === 'DISABLED') {
      if (membership.userId === auth.userId) {
        throw new BadRequestException({ code: 'CANNOT_DISABLE_SELF', message: 'You can’t disable your own access.' });
      }
      if (await this.isLastActiveDirector(schoolId, membership)) {
        throw new BadRequestException({
          code: 'LAST_DIRECTOR',
          message: 'This is the school’s only Director, so their access can’t be disabled.',
        });
      }
    }

    await this.prisma.schoolMembership.update({ where: { id: membershipId }, data: { status } });
    if (status === 'DISABLED') {
      // Their open sessions in this school end now, not whenever they next click.
      await this.prisma.session.deleteMany({ where: { activeMembershipId: membershipId } });
    }
    await this.audit.record({
      schoolId,
      userId: auth.userId,
      action: status === 'DISABLED' ? 'user.disable' : 'user.reactivate',
      module: 'user',
      resourceType: 'SchoolMembership',
      resourceId: membershipId,
      metadata: { targetUserId: membership.userId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { membershipId, status };
  }
}
