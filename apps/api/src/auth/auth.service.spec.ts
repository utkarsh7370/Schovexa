import { UserStatus } from '@prisma/client';
import { AuthService } from './auth.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { resetTestData } from '../../test/db-helpers';
import { hashToken } from './token.util';

// Integration-style tests against the real schovexa_test database
// (apps/api/.env.test) rather than a mocked Prisma client — Prisma's
// query builder has enough surface area that mocking it convincingly
// tends to test the mock, not the behavior. This directly verifies the
// requirements listed in docs/authentication.md §11.

describe('AuthService', () => {
  let prisma: PrismaService;
  let audit: AuditService;
  let authService: AuthService;

  beforeAll(() => {
    prisma = new PrismaService();
    audit = new AuditService(prisma);
    // No SMTP_HOST in the test env (apps/api/.env.test) — EmailService
    // falls back to its no-op logging path, exactly as it does in any
    // environment without SMTP configured. Real enough to exercise here.
    authService = new AuthService(prisma, audit, new EmailService());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetTestData(prisma);
  });

  async function createActiveUser(email = 'active@example.test', password = 'correct-horse-battery') {
    return prisma.user.create({
      data: {
        email,
        firstName: 'Test',
        lastName: 'User',
        status: UserStatus.ACTIVE,
        passwordHash: await authService.hashPassword(password),
      },
    });
  }

  describe('password hashing', () => {
    it('hashes are not the plaintext password and verify correctly on login', async () => {
      const password = 'correct-horse-battery';
      const user = await createActiveUser('hash@example.test', password);
      expect(user.passwordHash).not.toEqual(password);

      const result = await authService.login('hash@example.test', password, {});
      expect(result.rawToken).toBeTruthy();
    });
  });

  describe('login', () => {
    it('succeeds only for ACTIVE users with correct credentials', async () => {
      await createActiveUser('login@example.test', 'correct-horse-battery');
      const result = await authService.login('login@example.test', 'correct-horse-battery', {});
      expect(result.rawToken).toHaveLength(64);
    });

    it('fails with an identical error for wrong password, unknown email, and non-ACTIVE accounts', async () => {
      await createActiveUser('states@example.test', 'correct-horse-battery');
      await prisma.user.create({
        data: {
          email: 'suspended@example.test',
          firstName: 'S',
          lastName: 'U',
          status: UserStatus.SUSPENDED,
          passwordHash: await authService.hashPassword('correct-horse-battery'),
        },
      });

      // Awaited one at a time (each with its own immediate .catch below) —
      // creating several rejected promises before any handler is attached
      // trips Node's unhandledRejection detector, which Jest attributes
      // to the running test even once the rejection is later handled.
      const messages: unknown[] = [];
      for (const [email, password] of [
        ['states@example.test', 'wrong-password'],
        ['nobody@example.test', 'whatever12345'],
        ['suspended@example.test', 'correct-horse-battery'],
      ] as const) {
        await expect(authService.login(email, password, {})).rejects.toMatchObject({ status: 401 });
        try {
          await authService.login(email, password, {});
        } catch (e) {
          messages.push((e as { getResponse: () => { message: string } }).getResponse().message);
        }
      }

      // Same message across all three — no user-enumeration channel.
      expect(new Set(messages).size).toBe(1);
    });

    it('creates a fresh session row on every login (no reuse)', async () => {
      await createActiveUser('fresh@example.test', 'correct-horse-battery');
      const first = await authService.login('fresh@example.test', 'correct-horse-battery', {});
      const second = await authService.login('fresh@example.test', 'correct-horse-battery', {});
      expect(first.rawToken).not.toEqual(second.rawToken);

      const sessionCount = await prisma.session.count();
      expect(sessionCount).toBe(2);
    });
  });

  describe('validateSession', () => {
    it('returns a context for a valid session and touches lastSeenAt (sliding expiry)', async () => {
      const user = await createActiveUser('slide@example.test', 'correct-horse-battery');
      const { rawToken } = await authService.login('slide@example.test', 'correct-horse-battery', {});

      const before = await prisma.session.findUnique({ where: { tokenHash: hashToken(rawToken) } });
      const context = await authService.validateSession(rawToken);
      expect(context?.userId).toEqual(user.id);

      const after = await prisma.session.findUnique({ where: { tokenHash: hashToken(rawToken) } });
      expect(after!.expiresAt.getTime()).toBeGreaterThan(before!.expiresAt.getTime() - 1000);
    });

    it('returns null for an unknown token', async () => {
      expect(await authService.validateSession('not-a-real-token')).toBeNull();
    });

    it('returns null once the session is expired', async () => {
      const user = await createActiveUser('expired@example.test', 'correct-horse-battery');
      const { rawToken } = await authService.login('expired@example.test', 'correct-horse-battery', {});
      await prisma.session.updateMany({
        where: { userId: user.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(await authService.validateSession(rawToken)).toBeNull();
    });

    it('returns null immediately once the user is disabled mid-session — not just at next login', async () => {
      const user = await createActiveUser('disabled-mid-session@example.test', 'correct-horse-battery');
      const { rawToken } = await authService.login(
        'disabled-mid-session@example.test',
        'correct-horse-battery',
        {},
      );
      expect(await authService.validateSession(rawToken)).not.toBeNull();

      await prisma.user.update({ where: { id: user.id }, data: { status: UserStatus.DISABLED } });

      expect(await authService.validateSession(rawToken)).toBeNull();
    });
  });

  describe('password reset', () => {
    it('reset token is single-use', async () => {
      await createActiveUser('reset@example.test', 'old-password-123');
      const rawToken = await authService.requestPasswordReset('reset@example.test');
      expect(rawToken).toBeTruthy();

      await authService.resetPassword(rawToken!, 'new-password-456');
      await expect(authService.resetPassword(rawToken!, 'another-password-789')).rejects.toMatchObject({
        status: 400,
      });
    });

    it('invalidates all other active sessions on reset', async () => {
      const user = await createActiveUser('reset-sessions@example.test', 'old-password-123');
      await authService.login('reset-sessions@example.test', 'old-password-123', {});
      await authService.login('reset-sessions@example.test', 'old-password-123', {});
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(2);

      const rawToken = await authService.requestPasswordReset('reset-sessions@example.test');
      await authService.resetPassword(rawToken!, 'new-password-456');

      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    });

    it('never reveals whether an email exists (returns null, does not throw)', async () => {
      await expect(authService.requestPasswordReset('nobody@example.test')).resolves.toBeNull();
    });
  });

  describe('invitations', () => {
    it('accept-invite activates an INVITED user and the token is single-use', async () => {
      const school = await prisma.school.create({ data: { name: 'Test School', slug: 'test-school-1' } });
      const role = await prisma.role.create({ data: { schoolId: school.id, name: 'Admin' } });

      const { rawToken, userId } = await authService.createInvitation({
        email: 'invitee@example.test',
        firstName: 'In',
        lastName: 'Vitee',
        schoolId: school.id,
        roleId: role.id,
      });

      const invited = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(invited.status).toBe(UserStatus.INVITED);

      await authService.acceptInvite(rawToken!, 'new-password-123');
      const activated = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(activated.status).toBe(UserStatus.ACTIVE);
      expect(activated.emailVerifiedAt).not.toBeNull();

      await expect(authService.acceptInvite(rawToken!, 'another-password')).rejects.toMatchObject({
        status: 400,
      });
    });

    it('reactivates a soft-deleted membership for the same (user, school) pair instead of erroring', async () => {
      const school = await prisma.school.create({ data: { name: 'Test School 2', slug: 'test-school-2' } });
      const role = await prisma.role.create({ data: { schoolId: school.id, name: 'Admin' } });

      const first = await authService.createInvitation({
        email: 'rejoin@example.test',
        firstName: 'Re',
        lastName: 'Join',
        schoolId: school.id,
        roleId: role.id,
      });

      await prisma.schoolMembership.updateMany({
        where: { userId: first.userId, schoolId: school.id },
        data: { deletedAt: new Date() },
      });

      await expect(
        authService.createInvitation({
          email: 'rejoin@example.test',
          firstName: 'Re',
          lastName: 'Join',
          schoolId: school.id,
          roleId: role.id,
        }),
      ).resolves.toBeDefined();

      const active = await prisma.schoolMembership.findFirst({
        where: { userId: first.userId, schoolId: school.id, deletedAt: null },
      });
      expect(active).not.toBeNull();
    });
  });

  describe('selectSchool', () => {
    it('rejects a membership that does not belong to the user', async () => {
      const user = await createActiveUser('select@example.test', 'correct-horse-battery');
      const other = await createActiveUser('other@example.test', 'correct-horse-battery');
      const school = await prisma.school.create({ data: { name: 'S', slug: 'select-school-test' } });
      const role = await prisma.role.create({ data: { schoolId: school.id, name: 'Admin' } });
      const membership = await prisma.schoolMembership.create({
        data: { userId: other.id, schoolId: school.id, roleId: role.id },
      });

      const { rawToken } = await authService.login('select@example.test', 'correct-horse-battery', {});
      const session = await authService.validateSession(rawToken);

      await expect(
        authService.selectSchool(user.id, session!.sessionId, membership.id),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('accepts a valid, ACTIVE membership belonging to the user', async () => {
      const user = await createActiveUser('select-ok@example.test', 'correct-horse-battery');
      const school = await prisma.school.create({ data: { name: 'S2', slug: 'select-school-test-2' } });
      const role = await prisma.role.create({ data: { schoolId: school.id, name: 'Admin' } });
      const membership = await prisma.schoolMembership.create({
        data: { userId: user.id, schoolId: school.id, roleId: role.id },
      });

      const { rawToken } = await authService.login('select-ok@example.test', 'correct-horse-battery', {});
      const session = await authService.validateSession(rawToken);

      await authService.selectSchool(user.id, session!.sessionId, membership.id);

      const updated = await prisma.session.findUnique({ where: { id: session!.sessionId } });
      expect(updated?.activeMembershipId).toEqual(membership.id);
    });
  });
});
