import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthTokenPurpose, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { generateOpaqueToken, hashToken } from './token.util';
import {
  EMAIL_VERIFICATION_COOLDOWN_MS,
  EMAIL_VERIFICATION_TTL_MS,
  GENERIC_LOGIN_ERROR,
  INVITE_TOKEN_TTL_MS,
  LOGIN_LOCK_WINDOW_MS,
  LOGIN_MAX_FAILURES_PER_EMAIL,
  LOGIN_MAX_FAILURES_PER_IP,
  REMEMBER_SESSION_ABSOLUTE_MAX_MS,
  REMEMBER_SESSION_TTL_MS,
  RESET_TOKEN_TTL_MS,
  SESSION_ABSOLUTE_MAX_MS,
  SESSION_TTL_MS,
} from './auth.constants';
import { describeDevice } from './device.util';
import type { CurrentUser } from '@schovexa/types';

export interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface SessionContext {
  userId: string;
  sessionId: string;
  activeMembershipId: string | null;
  // When the person last proved who they are (login or re-entering their
  // password) — sensitive actions require it to be recent.
  reauthenticatedAt: Date | null;
  emailVerified: boolean;
}

/** Names that must not appear inside a password: the person's own email and name. */
interface PasswordSubject {
  email: string;
  firstName: string;
  lastName: string;
}

const lettersAndDigits = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  private webUrl(path: string): string {
    const origin = (process.env.WEB_ORIGIN ?? '').split(',')[0].trim() || 'http://localhost:3000';
    return `${origin}${path}`;
  }

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

  /** Throws 429 when this email — or this address — has failed to sign in too often, too recently. */
  private async assertNotLocked(email: string, ipAddress: string | null | undefined): Promise<void> {
    const since = new Date(Date.now() - LOGIN_LOCK_WINDOW_MS);
    const [byEmail, byIp] = await Promise.all([
      this.prisma.loginAttempt.findMany({ where: { email, success: false, createdAt: { gte: since } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      ipAddress ? this.prisma.loginAttempt.count({ where: { ipAddress, success: false, createdAt: { gte: since } } }) : Promise.resolve(0),
    ]);
    const emailLocked = byEmail.length >= LOGIN_MAX_FAILURES_PER_EMAIL;
    if (emailLocked || byIp >= LOGIN_MAX_FAILURES_PER_IP) {
      // The lock lifts when the oldest counted failure leaves the window.
      const oldest = emailLocked ? byEmail[byEmail.length - LOGIN_MAX_FAILURES_PER_EMAIL].createdAt.getTime() : Date.now();
      const retryAfterSeconds = Math.max(60, Math.ceil((oldest + LOGIN_LOCK_WINDOW_MS - Date.now()) / 1000));
      throw new HttpException(
        {
          code: 'TOO_MANY_ATTEMPTS',
          message: `Too many failed attempts. For your security, try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s), or reset your password.`,
          retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async recordAttempt(email: string, success: boolean, meta: RequestMeta): Promise<void> {
    await this.prisma.loginAttempt.create({ data: { email, success, ipAddress: meta.ipAddress ?? null } });
    // Housekeeping: nothing older than a month is ever consulted.
    if (success) await this.prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } });
  }

  /**
   * Identical error for wrong password, unknown email, and non-ACTIVE
   * accounts — docs/authentication.md §7, no user enumeration. Repeated
   * failures lock the email (and the address) for a while; the lock applies
   * whether or not the email belongs to anyone, so it can't be used to find out.
   */
  async login(
    email: string,
    password: string,
    meta: RequestMeta,
    rememberMe = false,
  ): Promise<{ rawToken: string; user: { id: string }; rememberMe: boolean }> {
    const normalizedEmail = email.trim().toLowerCase();
    await this.assertNotLocked(normalizedEmail, meta.ipAddress);

    const user = await this.prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' }, deletedAt: null },
    });

    const passwordOk = user ? await this.verifyPassword(user.passwordHash, password) : false;

    if (!user || !passwordOk || user.status !== UserStatus.ACTIVE) {
      await this.recordAttempt(normalizedEmail, false, meta);
      // Failed attempts are logged (who they tried, from where) — never the password.
      await this.audit.record({
        userId: user?.id ?? null,
        action: 'auth.login_failed',
        module: 'auth',
        resourceType: 'User',
        resourceId: user?.id ?? normalizedEmail,
        metadata: { reason: !user ? 'unknown_email' : !passwordOk ? 'wrong_password' : 'account_not_active' },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: GENERIC_LOGIN_ERROR });
    }

    // Is this a browser we haven't seen on this account before? (Checked
    // before the new session exists, or it would always match itself.)
    const userAgent = meta.userAgent?.slice(0, 300) ?? null;
    const [everSignedIn, knownDevice] = await Promise.all([
      this.prisma.session.count({ where: { userId: user.id } }),
      userAgent ? this.prisma.session.count({ where: { userId: user.id, userAgent } }) : Promise.resolve(0),
    ]);

    // Session-fixation mitigation: every successful login is a fresh
    // session row — there is nothing "pre-auth" to rotate away from in
    // this stateless-until-login design, but a new session is always
    // issued, never reused. See docs/security-scalability-review.md F2.
    const rawToken = generateOpaqueToken();
    const ttl = rememberMe ? REMEMBER_SESSION_TTL_MS : SESSION_TTL_MS;
    await this.prisma.session.create({
      data: {
        tokenHash: hashToken(rawToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + ttl),
        userAgent,
        ipAddress: meta.ipAddress ?? null,
        rememberMe,
        reauthenticatedAt: new Date(),
      },
    });

    await this.prisma.loginAttempt.deleteMany({ where: { email: normalizedEmail, success: false } });
    await this.recordAttempt(normalizedEmail, true, meta);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const device = describeDevice(userAgent);
    await this.audit.record({
      userId: user.id,
      action: 'auth.login',
      module: 'auth',
      resourceType: 'User',
      resourceId: user.id,
      metadata: { device: device.label, rememberMe },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    if (everSignedIn > 0 && knownDevice === 0) {
      void this.email.send({
        to: user.email,
        subject: 'New sign-in to your Schovexa account',
        text: `Your account was just signed in to from ${device.label}${meta.ipAddress ? ` (${meta.ipAddress})` : ''}.\n\nIf this was you, there's nothing to do. If it wasn't, reset your password now and sign out other devices from My profile → Security.`,
        html: `<p>Your account was just signed in to from <strong>${device.label}</strong>${meta.ipAddress ? ` (${meta.ipAddress})` : ''}.</p><p>If this was you, there’s nothing to do. If it wasn’t, <a href="${this.webUrl('/forgot-password')}">reset your password</a> now and sign out other devices from <em>My profile → Security</em>.</p>`,
      });
    }

    return { rawToken, user: { id: user.id }, rememberMe };
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
    // Hard cap from sign-in: sliding extension never carries a session past it.
    const absoluteMax = session.rememberMe ? REMEMBER_SESSION_ABSOLUTE_MAX_MS : SESSION_ABSOLUTE_MAX_MS;
    if (session.createdAt.getTime() + absoluteMax < Date.now()) {
      return null;
    }

    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) {
      return null;
    }

    // Sliding expiration: extend on every validated request — but never past
    // the absolute cap.
    const ttl = session.rememberMe ? REMEMBER_SESSION_TTL_MS : SESSION_TTL_MS;
    const slid = Date.now() + ttl;
    const cap = session.createdAt.getTime() + absoluteMax;
    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), expiresAt: new Date(Math.min(slid, cap)) },
    });

    return {
      userId: user.id,
      sessionId: session.id,
      activeMembershipId: session.activeMembershipId,
      reauthenticatedAt: session.reauthenticatedAt,
      emailVerified: !!user.emailVerifiedAt,
    };
  }

  // --- /auth/me + school selection ---------------------------------------

  async getCurrentUser(userId: string, activeMembershipId: string | null): Promise<CurrentUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          where: { deletedAt: null },
          include: { school: true, role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });

    const activeMembership = activeMembershipId
      ? user.memberships.find((m) => m.id === activeMembershipId && m.status === 'ACTIVE')
      : undefined;

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      activeSchoolId: activeMembership?.schoolId ?? null,
      permissions: activeMembership?.role.permissions.map((rp) => rp.permission.key).sort() ?? [],
      schoolCountry: activeMembership?.school.country ?? null,
      emailVerified: !!user.emailVerifiedAt,
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

  // --- Passwords ---------------------------------------------------------

  /**
   * The password must not contain the person's own email or name — the first
   * things anyone would guess. (The shared schema already refuses short,
   * common and trivial passwords; this adds the part that needs to know who
   * the password is for.)
   */
  assertPasswordAcceptable(password: string, subject: PasswordSubject, field = 'password'): void {
    const normalized = lettersAndDigits(password);
    const parts = [subject.email.split('@')[0], subject.firstName, subject.lastName].map(lettersAndDigits).filter((p) => p.length >= 4);
    if (parts.some((part) => normalized.includes(part))) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Choose a password that doesn’t contain your name or email address.',
        details: [{ field, message: 'Choose a password that doesn’t contain your name or email address.' }],
      });
    }
  }

  // --- Single-use tokens -----------------------------------------------

  /** Issues a token and retires every earlier unused one for the same person and purpose (docs/authentication.md §4). */
  private async issueToken(userId: string, purpose: AuthTokenPurpose, ttlMs: number): Promise<string> {
    await this.prisma.authToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } });
    const rawToken = generateOpaqueToken();
    await this.prisma.authToken.create({
      data: { userId, tokenHash: hashToken(rawToken), purpose, expiresAt: new Date(Date.now() + ttlMs) },
    });
    return rawToken;
  }

  // --- Password reset (docs/authentication.md §6) ------------------------

  /** Always call this and always respond 200 regardless of the result — no enumeration. */
  async requestPasswordReset(email: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({ where: { email: { equals: email.trim(), mode: 'insensitive' }, deletedAt: null } });
    if (!user) return null;

    const rawToken = await this.issueToken(user.id, AuthTokenPurpose.RESET, RESET_TOKEN_TTL_MS);

    const link = this.webUrl(`/reset-password?token=${rawToken}`);
    void this.email.send({
      to: user.email,
      subject: 'Reset your Schovexa password',
      text: `We received a request to reset your password. Reset it here: ${link}\n\nIf you didn't request this, you can ignore this email.`,
      html: `<p>We received a request to reset your password.</p><p><a href="${link}">Reset your password</a></p><p>If you didn't request this, you can ignore this email.</p>`,
    });

    // The raw token is still returned so callers can log/display it as a
    // fallback (docs/architecture.md §9's in-app-first design, and the
    // EmailService above degrades to a no-op when SMTP isn't configured).
    return rawToken;
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const token = await this.consumeToken(rawToken, AuthTokenPurpose.RESET);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: token.userId } });
    this.assertPasswordAcceptable(newPassword, user);

    await this.prisma.user.update({
      where: { id: token.userId },
      data: {
        passwordHash: await this.hashPassword(newPassword),
        // Receiving the reset email proves the address is theirs — which is
        // all an invitation proves, so someone who never finished their
        // invite can finish it this way.
        ...(user.status === UserStatus.INVITED ? { status: UserStatus.ACTIVE } : {}),
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      },
    });

    // Invalidate every other active session for this user — an attacker
    // holding a pre-reset session must not survive the victim's reset.
    await this.prisma.session.deleteMany({ where: { userId: token.userId } });
    // A reset is also the way out of a login lockout.
    await this.prisma.loginAttempt.deleteMany({ where: { email: user.email.toLowerCase() } });

    await this.audit.record({
      userId: token.userId,
      action: 'auth.password_reset',
      module: 'auth',
      resourceType: 'User',
      resourceId: token.userId,
    });
  }

  /**
   * Signed-in password change: the current password must be re-entered
   * (a stolen session alone must not be enough to lock the owner out), and
   * every OTHER session is revoked so a device that was already signed in
   * as someone else is kicked out. The session making the change survives.
   */
  async changePassword(userId: string, currentSessionId: string, currentPassword: string, newPassword: string, meta: RequestMeta = {}): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await this.assertNotLocked(user.email.toLowerCase(), meta.ipAddress);
    if (!(await this.verifyPassword(user.passwordHash, currentPassword))) {
      await this.recordAttempt(user.email.toLowerCase(), false, meta);
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Your current password is incorrect.',
        details: [{ field: 'currentPassword', message: 'Your current password is incorrect.' }],
      });
    }
    this.assertPasswordAcceptable(newPassword, user, 'newPassword');

    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await this.hashPassword(newPassword) } });
    await this.prisma.session.deleteMany({ where: { userId, NOT: { id: currentSessionId } } });
    await this.prisma.session.update({ where: { id: currentSessionId }, data: { reauthenticatedAt: new Date() } });

    await this.audit.record({
      userId,
      action: 'auth.password_changed',
      module: 'auth',
      resourceType: 'User',
      resourceId: userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    void this.email.send({
      to: user.email,
      subject: 'Your Schovexa password was changed',
      text: 'Your password was just changed and other devices were signed out. If this wasn’t you, reset your password immediately.',
      html: `<p>Your password was just changed and other devices were signed out.</p><p>If this wasn’t you, <a href="${this.webUrl('/forgot-password')}">reset your password</a> immediately.</p>`,
    });
  }

  // --- Sensitive actions: prove it's still you ------------------------------

  /**
   * Re-enter the password to mark this session "freshly verified" for a few
   * minutes. Wrong guesses count toward the same lockout as sign-in, so this
   * can't be used to brute-force a password from a stolen session.
   */
  async reauthenticate(userId: string, sessionId: string, password: string, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const email = user.email.toLowerCase();
    await this.assertNotLocked(email, meta.ipAddress);

    if (!(await this.verifyPassword(user.passwordHash, password))) {
      await this.recordAttempt(email, false, meta);
      await this.audit.record({
        userId,
        action: 'auth.reauth_failed',
        module: 'auth',
        resourceType: 'User',
        resourceId: userId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'That password isn’t right.',
        details: [{ field: 'password', message: 'That password isn’t right.' }],
      });
    }

    await this.prisma.session.update({ where: { id: sessionId }, data: { reauthenticatedAt: new Date() } });
    await this.audit.record({
      userId,
      action: 'auth.reauth',
      module: 'auth',
      resourceType: 'User',
      resourceId: userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  // --- Devices & sessions ---------------------------------------------------

  private liveSessionsWhere(userId: string) {
    return { userId, revokedAt: null, expiresAt: { gt: new Date() } };
  }

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.session.findMany({
      where: this.liveSessionsWhere(userId),
      orderBy: { lastSeenAt: 'desc' },
    });
    const now = Date.now();
    return sessions
      .filter((s) => s.createdAt.getTime() + (s.rememberMe ? REMEMBER_SESSION_ABSOLUTE_MAX_MS : SESSION_ABSOLUTE_MAX_MS) > now)
      .map((s) => ({
        id: s.id,
        current: s.id === currentSessionId,
        device: describeDevice(s.userAgent),
        ipAddress: s.ipAddress,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        rememberMe: s.rememberMe,
      }));
  }

  /** Signs one other device out. (To end this session, log out.) */
  async revokeSession(userId: string, currentSessionId: string, sessionId: string, meta: RequestMeta): Promise<void> {
    if (sessionId === currentSessionId) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'That’s the device you’re using — use Log out instead.' });
    }
    const target = await this.prisma.session.findFirst({ where: { id: sessionId, userId } });
    if (!target) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    await this.prisma.session.delete({ where: { id: sessionId } });
    await this.audit.record({
      userId,
      action: 'auth.session_revoked',
      module: 'auth',
      resourceType: 'Session',
      resourceId: sessionId,
      metadata: { device: describeDevice(target.userAgent).label },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  async revokeOtherSessions(userId: string, currentSessionId: string, meta: RequestMeta): Promise<{ revoked: number }> {
    const result = await this.prisma.session.deleteMany({ where: { userId, NOT: { id: currentSessionId } } });
    await this.audit.record({
      userId,
      action: 'auth.sessions_revoked_all',
      module: 'auth',
      resourceType: 'User',
      resourceId: userId,
      metadata: { count: result.count },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return { revoked: result.count };
  }

  // --- Security activity (the person's own) -------------------------------

  private static readonly ACTIVITY_LABELS: Record<string, string> = {
    'auth.login': 'Signed in',
    'auth.logout': 'Signed out',
    'auth.login_failed': 'Failed sign-in attempt',
    'auth.password_changed': 'Password changed',
    'auth.password_reset': 'Password reset',
    'auth.reauth': 'Confirmed password for a sensitive action',
    'auth.reauth_failed': 'Wrong password when confirming a sensitive action',
    'auth.session_revoked': 'Signed another device out',
    'auth.sessions_revoked_all': 'Signed all other devices out',
    'auth.email_verified': 'Email address verified',
    'auth.invite_accepted': 'Account activated',
  };

  async activity(userId: string) {
    const rows = await this.prisma.auditLog.findMany({
      where: { userId, module: 'auth' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      label: AuthService.ACTIVITY_LABELS[r.action] ?? r.action,
      // Failed attempts and password events are the ones worth a second look.
      alert: ['auth.login_failed', 'auth.reauth_failed', 'auth.password_changed', 'auth.password_reset'].includes(r.action),
      device: r.userAgent ? describeDevice(r.userAgent).label : null,
      ipAddress: r.ipAddress,
      createdAt: r.createdAt,
    }));
  }

  // --- Email verification ---------------------------------------------------

  /** Emails a fresh verification link (older ones stop working). Silent no-op if already verified. */
  async sendVerificationEmail(userId: string, options: { enforceCooldown?: boolean } = {}): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) return;

    if (options.enforceCooldown) {
      const latest = await this.prisma.authToken.findFirst({
        where: { userId, purpose: AuthTokenPurpose.EMAIL_VERIFICATION },
        orderBy: { createdAt: 'desc' },
      });
      if (latest && Date.now() - latest.createdAt.getTime() < EMAIL_VERIFICATION_COOLDOWN_MS) {
        throw new HttpException(
          { code: 'RATE_LIMITED', message: 'A verification email was just sent. Give it a minute, then try again.' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const rawToken = await this.issueToken(userId, AuthTokenPurpose.EMAIL_VERIFICATION, EMAIL_VERIFICATION_TTL_MS);
    const link = this.webUrl(`/verify-email?token=${rawToken}`);
    void this.email.send({
      to: user.email,
      subject: 'Confirm your email address for Schovexa',
      text: `Welcome to Schovexa, ${user.firstName}! Confirm your email address here: ${link}\n\nThis link expires in 24 hours. If you didn't create a Schovexa account, you can ignore this email.`,
      html: `<p>Welcome to Schovexa, ${user.firstName.replace(/[<>&]/g, '')}!</p><p><a href="${link}">Confirm your email address</a></p><p>This link expires in 24 hours. If you didn’t create a Schovexa account, you can ignore this email.</p>`,
    });
    if (process.env.NODE_ENV === 'development' && !this.email.isConfigured) {
      // Local development has no mail server: show the link where a developer will look.
      // (Never in production — a verification link is a credential.)
      // eslint-disable-next-line no-console
      console.log(`[dev] Email verification link for ${user.email}: ${link}`);
    }
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const token = await this.consumeToken(rawToken, AuthTokenPurpose.EMAIL_VERIFICATION);
    await this.prisma.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: new Date() } });
    await this.audit.record({
      userId: token.userId,
      action: 'auth.email_verified',
      module: 'auth',
      resourceType: 'User',
      resourceId: token.userId,
    });
  }

  // --- Invitations (docs/authentication.md §5) ----------------------------
  //
  // Account-creation rule: the only person who ever creates their OWN account
  // from scratch is the owner registering a school. Everyone else — staff,
  // teachers, parents — is added by someone with the authority to, and then
  // sets their own password through a single-use link sent to their email.

  /**
   * Returns the invite token, or `null` when none was needed: if the email
   * already belongs to an active account, the person is simply added to the
   * school. No token is issued in that case — an admin of one school must
   * never be handed a way to set the password of someone else's account.
   */
  async createInvitation(input: {
    email: string;
    firstName: string;
    lastName: string;
    schoolId: string;
    roleId: string;
  }): Promise<{ rawToken: string | null; userId: string; existingAccount: boolean }> {
    const email = input.email.trim().toLowerCase();
    let user = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null } });
    const existingAccount = !!user && user.status !== UserStatus.INVITED;

    if (user && (user.status === UserStatus.DISABLED || user.status === UserStatus.SUSPENDED)) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'This email can’t be invited right now.' });
    }

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
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

    const school = await this.prisma.school.findUnique({ where: { id: input.schoolId }, select: { name: true } });
    const schoolName = (school?.name ?? 'A school').replace(/[<>&]/g, '');

    if (existingAccount) {
      void this.email.send({
        to: user.email,
        subject: `You've been added to ${school?.name ?? 'a school'} on Schovexa`,
        text: `${school?.name ?? 'A school'} has added you to their Schovexa portal. Sign in with your existing account and choose the school to get started: ${this.webUrl('/login')}`,
        html: `<p>${schoolName} has added you to their Schovexa portal.</p><p><a href="${this.webUrl('/login')}">Sign in</a> with your existing account and choose the school to get started.</p>`,
      });
      return { rawToken: null, userId: user.id, existingAccount: true };
    }

    const rawToken = await this.issueToken(user.id, AuthTokenPurpose.INVITE, INVITE_TOKEN_TTL_MS);
    const link = this.webUrl(`/accept-invite?token=${rawToken}`);
    void this.email.send({
      to: input.email,
      subject: `You're invited to ${school?.name ?? 'Schovexa'}`,
      text: `${school?.name ?? 'A school'} has invited you to join their Schovexa portal. Set up your account here: ${link}\n\nThis link expires in 7 days.`,
      html: `<p>${schoolName} has invited you to join their Schovexa portal.</p><p><a href="${link}">Set up your account</a></p><p>This link expires in 7 days.</p>`,
    });

    return { rawToken, userId: user.id, existingAccount: false };
  }

  async acceptInvite(rawToken: string, password: string): Promise<void> {
    const token = await this.consumeToken(rawToken, AuthTokenPurpose.INVITE);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: token.userId } });
    // An invitation only ever activates someone who hasn't set a password yet.
    // For anyone else it is not a way to change a password.
    if (user.status !== UserStatus.INVITED) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'This link is invalid or has expired.' });
    }
    this.assertPasswordAcceptable(password, user);

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

    // Single use, enforced atomically: two simultaneous requests with the
    // same link can't both succeed.
    const claimed = await this.prisma.authToken.updateMany({ where: { id: token.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count === 0) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'This link is invalid or has expired.' });
    }
    return token;
  }
}
