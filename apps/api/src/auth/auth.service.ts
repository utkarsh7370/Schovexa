import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthTokenPurpose, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { generateOpaqueToken, hashToken } from './token.util';
import {
  GENERIC_LOGIN_ERROR,
  INVITE_TOKEN_TTL_MS,
  RESET_TOKEN_TTL_MS,
  SESSION_TTL_MS,
} from './auth.constants';
import type { CurrentUser } from '@schovexa/types';

export interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface SessionContext {
  userId: string;
  sessionId: string;
  activeMembershipId: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Password hashing (docs/authentication.md §1) ---------------------

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  private async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  // --- Login / Logout (docs/authentication.md §2) -----------------------

  /**
   * Identical error for wrong password, unknown email, and non-ACTIVE
   * accounts — docs/authentication.md §7, no user enumeration.
   */
  async login(email: string, password: string, meta: RequestMeta): Promise<{ rawToken: string; user: { id: string } }> {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    const passwordOk = user ? await this.verifyPassword(user.passwordHash, password) : false;

    if (!user || !passwordOk || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: GENERIC_LOGIN_ERROR });
    }

    // Session-fixation mitigation: every successful login is a fresh
    // session row — there is nothing "pre-auth" to rotate away from in
    // this stateless-until-login design, but a new session is always
    // issued, never reused. See docs/security-scalability-review.md F2.
    const rawToken = generateOpaqueToken();
    await this.prisma.session.create({
      data: {
        tokenHash: hashToken(rawToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    await this.audit.record({
      userId: user.id,
      action: 'auth.login',
      module: 'auth',
      resourceType: 'User',
      resourceId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { rawToken, user: { id: user.id } };
  }

  async logout(rawToken: string, meta: RequestMeta): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const session = await this.prisma.session.findUnique({ where: { tokenHash } });
    if (!session) return; // already gone — logout is idempotent

    await this.prisma.session.delete({ where: { id: session.id } });
    await this.audit.record({
      userId: session.userId,
      action: 'auth.logout',
      module: 'auth',
      resourceType: 'User',
      resourceId: session.userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  /**
   * Validates a session cookie value. Returns null (never throws) so
   * callers — namely AuthGuard — decide the HTTP response; a session
   * lookup is not itself an authorization decision.
   */
  async validateSession(rawToken: string): Promise<SessionContext | null> {
    const tokenHash = hashToken(rawToken);
    const session = await this.prisma.session.findUnique({ where: { tokenHash } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return null;
    }

    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) {
      return null;
    }

    // Sliding expiration: extend on every validated request.
    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });

    return {
      userId: user.id,
      sessionId: session.id,
      activeMembershipId: session.activeMembershipId,
    };
  }

  // --- /auth/me + school selection ---------------------------------------

  async getCurrentUser(userId: string): Promise<CurrentUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          where: { deletedAt: null },
          include: { school: true, role: true },
        },
      },
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      memberships: user.memberships.map((m) => ({
        membershipId: m.id,
        schoolId: m.schoolId,
        schoolName: m.school.name,
        roleName: m.role.name,
        status: m.status,
      })),
    };
  }

  /**
   * Re-verifies membership server-side (never trusts a cached client
   * value) before attaching it as the session's active school — see
   * docs/multi-tenancy.md §2.
   */
  async selectSchool(userId: string, sessionId: string, membershipId: string): Promise<void> {
    const membership = await this.prisma.schoolMembership.findFirst({
      where: { id: membershipId, userId, deletedAt: null, status: 'ACTIVE' },
    });
    if (!membership) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'That membership is not available for this account.',
      });
    }

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { activeMembershipId: membership.id },
    });
  }

  // --- Password reset (docs/authentication.md §6) ------------------------

  /** Always call this and always respond 200 regardless of the result — no enumeration. */
  async requestPasswordReset(email: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({ where: { email, deletedAt: null } });
    if (!user) return null;

    const rawToken = generateOpaqueToken();
    await this.prisma.authToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        purpose: AuthTokenPurpose.RESET,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });
    // Emailing the raw token is Phase 2's notification integration
    // (docs/architecture.md §9); returned here so callers can log/deliver
    // it in the interim.
    return rawToken;
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const token = await this.consumeToken(rawToken, AuthTokenPurpose.RESET);

    await this.prisma.user.update({
      where: { id: token.userId },
      data: { passwordHash: await this.hashPassword(newPassword) },
    });

    // Invalidate every other active session for this user — an attacker
    // holding a pre-reset session must not survive the victim's reset.
    await this.prisma.session.deleteMany({ where: { userId: token.userId } });

    await this.audit.record({
      userId: token.userId,
      action: 'auth.password_reset',
      module: 'auth',
      resourceType: 'User',
      resourceId: token.userId,
    });
  }

  // --- Invitations (docs/authentication.md §5) ----------------------------
  // Creating an invitation is a permission-gated admin action (`user.create`)
  // that belongs behind the authorization guard built in the next phase
  // (docs/authorization.md) — this service method is ready for that
  // controller to call once it exists; it is not yet exposed over HTTP.

  async createInvitation(input: {
    email: string;
    firstName: string;
    lastName: string;
    schoolId: string;
    roleId: string;
  }): Promise<{ rawToken: string; userId: string }> {
    let user = await this.prisma.user.findFirst({ where: { email: input.email, deletedAt: null } });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          passwordHash: '', // set on accept-invite; never a valid argon2 hash until then
          status: UserStatus.INVITED,
        },
      });
    }

    // Not a Prisma `.upsert()`: the F1 fix (docs/security-scalability-
    // review.md) replaced the compound @@unique([userId, schoolId]) with
    // a plain index plus a partial unique index enforced at the SQL
    // level, so there is no Prisma-typed composite key left to upsert
    // against. A soft-deleted membership for this (user, school) pair is
    // reactivated rather than left orphaned; unique-among-active rows is
    // still guaranteed by that partial index regardless.
    const existingMembership = await this.prisma.schoolMembership.findFirst({
      where: { userId: user.id, schoolId: input.schoolId, deletedAt: null },
    });
    if (existingMembership) {
      await this.prisma.schoolMembership.update({
        where: { id: existingMembership.id },
        data: { roleId: input.roleId, status: 'ACTIVE' },
      });
    } else {
      await this.prisma.schoolMembership.create({
        data: { userId: user.id, schoolId: input.schoolId, roleId: input.roleId },
      });
    }

    const rawToken = generateOpaqueToken();
    await this.prisma.authToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        purpose: AuthTokenPurpose.INVITE,
        expiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS),
      },
    });

    return { rawToken, userId: user.id };
  }

  async acceptInvite(rawToken: string, password: string): Promise<void> {
    const token = await this.consumeToken(rawToken, AuthTokenPurpose.INVITE);

    await this.prisma.user.update({
      where: { id: token.userId },
      data: {
        passwordHash: await this.hashPassword(password),
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    await this.audit.record({
      userId: token.userId,
      action: 'auth.invite_accepted',
      module: 'auth',
      resourceType: 'User',
      resourceId: token.userId,
    });
  }

  // --- Shared token consumption -------------------------------------------

  private async consumeToken(rawToken: string, purpose: AuthTokenPurpose) {
    const tokenHash = hashToken(rawToken);
    const token = await this.prisma.authToken.findUnique({ where: { tokenHash } });

    if (!token || token.purpose !== purpose || token.usedAt || token.expiresAt < new Date()) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'This link is invalid or has expired.',
      });
    }

    await this.prisma.authToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
    return token;
  }
}
