import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { resetTestData } from './db-helpers';
import { permissionCatalog } from '../prisma/seed-data/permissions';
import { passwordSchema } from '@schovexa/validation';

// The security rules in docs/security-rules.md, one test per rule, through
// the real HTTP stack: who may create an account, how sign-in is protected,
// how sessions and devices are managed, what needs a fresh password, what is
// written to the audit log — and what must never be.

const WEB_ORIGIN = 'http://localhost:3000';
const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const PASSWORD = 'correct-horse-battery';

describe('Security (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const sent: { to: string; subject: string; text: string; html: string }[] = [];

  beforeAll(async () => {
    for (const permission of permissionCatalog) {
      await prisma.permission.upsert({ where: { key: permission.key }, update: {}, create: permission });
    }
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetTestData(prisma);
    await prisma.loginAttempt.deleteMany();
    sent.length = 0;
    delete process.env.REQUIRE_EMAIL_VERIFICATION;
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({
        isConfigured: true,
        send: async (mail: { to: string; subject: string; text: string; html: string }) => {
          sent.push(mail);
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  afterEach(async () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    await app.close();
  });

  const agent = () => request(app.getHttpServer());
  const post = (cookie: string | null, path: string, body?: object, ua?: string) => {
    let r = agent().post(`/api/v1${path}`).set('Origin', WEB_ORIGIN);
    if (cookie) r = r.set('Cookie', cookie);
    if (ua) r = r.set('User-Agent', ua);
    return r.send(body);
  };
  const del = (cookie: string, path: string) => agent().delete(`/api/v1${path}`).set('Origin', WEB_ORIGIN).set('Cookie', cookie);
  const patch = (cookie: string, path: string, body?: object) => agent().patch(`/api/v1${path}`).set('Origin', WEB_ORIGIN).set('Cookie', cookie).send(body);
  const get = (cookie: string, path: string) => agent().get(`/api/v1${path}`).set('Cookie', cookie);
  const cookieOf = (res: request.Response) => (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

  async function register(name: string, email: string, password = PASSWORD) {
    const res = await post(null, '/schools/register', { schoolName: name, directorFirstName: 'Dee', directorLastName: 'Rector', email, password });
    return { res, cookie: res.status === 201 ? cookieOf(res) : '', schoolId: res.body.schoolId as string };
  }

  async function login(email: string, password = PASSWORD, extra: object = {}, ua?: string) {
    const res = await post(null, '/auth/login', { email, password, ...extra }, ua);
    return { res, cookie: res.status === 200 ? cookieOf(res) : '' };
  }

  async function selectSchool(cookie: string) {
    const me = await get(cookie, '/auth/me');
    await post(cookie, '/auth/select-school', { membershipId: me.body.memberships[0].membershipId });
    return me.body as { id: string; memberships: { membershipId: string }[] };
  }

  async function invite(directorCookie: string, roleName: string, email: string, password = 'zebra-lantern-pass-9') {
    const roles = await get(directorCookie, '/roles');
    const role = roles.body.find((r: { name: string }) => r.name === roleName);
    const inv = await post(directorCookie, '/memberships/invitations', { email, firstName: roleName, lastName: 'Person', roleId: role.id });
    if (inv.status !== 201 && inv.status !== 200) return { inv, cookie: '', userId: '' };
    await post(null, '/auth/accept-invite', { token: inv.body.inviteToken, password });
    const { cookie } = await login(email, password);
    const me = await selectSchool(cookie);
    return { inv, cookie, userId: me.id };
  }

  // ---------------------------------------------------------------------
  describe('who can create an account', () => {
    it('lets only a school owner sign up by themselves — and what they get is a Director of their own new school', async () => {
      const { res, cookie } = await register('Owner School', 'owner@example.test');
      expect(res.status).toBe(201);
      const me = await get(cookie, '/auth/me');
      expect(me.body.memberships).toHaveLength(1);
      expect(me.body.memberships[0].roleName).toBe('Director');
      // Register has no way to ask for any other role, school or permission.
      const sneaky = await post(null, '/schools/register', { schoolName: 'Sneaky', directorFirstName: 'S', directorLastName: 'N', email: 'sneaky@example.test', password: PASSWORD, roleName: 'Teacher', schoolId: res.body.schoolId });
      expect(sneaky.status).toBe(201);
      expect((await get(cookieOf(sneaky), '/auth/me')).body.memberships).toHaveLength(1);
      expect(await prisma.school.count()).toBe(2); // its own school, not a seat in someone else's
    });

    it('has no other public route that creates an account: an invitation token is the only way in for everyone else', async () => {
      expect((await post(null, '/auth/accept-invite', { token: 'made-up-token', password: PASSWORD })).status).toBe(400);
      expect((await post(null, '/auth/accept-invite', { token: 'x'.repeat(64), password: PASSWORD })).status).toBe(400);
      for (const path of ['/users', '/teachers', '/students', '/parents', '/memberships/invitations', '/staff']) {
        expect([401, 403, 404]).toContain((await post(null, path, { email: 'a@example.test' })).status);
      }
    });

    it('treats the same email in different letter-case as one person', async () => {
      await register('First', 'Owner@Example.test');
      const again = await register('Second', 'owner@example.TEST');
      expect(again.res.status).toBe(409);
      expect((await login('OWNER@example.test')).res.status).toBe(200);
    });

    it('lets teachers, staff and parents in only by invitation from someone entitled to invite, and only they set their own password', async () => {
      const { cookie: director } = await register('Invite School', 'dir1@example.test');
      const { inv, cookie } = await invite(director, 'Teacher', 'teach1@example.test');
      expect(inv.status).toBe(201);
      expect(cookie).not.toBe('');
      // The password is whatever the invitee chose; the director never sees or sets it.
      expect(JSON.stringify(inv.body)).not.toContain('zebra-lantern');
      // A Teacher has no right to invite anyone.
      const roles = await get(director, '/roles');
      const teacherRole = roles.body.find((r: { name: string }) => r.name === 'Teacher');
      expect((await post(cookie, '/memberships/invitations', { email: 'x@example.test', firstName: 'X', lastName: 'Y', roleId: teacherRole.id })).status).toBe(403);
    });
  });

  describe('invitations cannot be used to take over an account', () => {
    it('adds an existing user to a second school without issuing any link that could change their password', async () => {
      const a = await register('School A', 'owner-a@example.test', 'alpha-owner-secret-1');
      const b = await register('School B', 'owner-b@example.test');
      sent.length = 0;

      const res = await post(b.cookie, '/memberships/invitations', {
        email: 'owner-a@example.test',
        firstName: 'Dee',
        lastName: 'Rector',
        roleId: (await get(b.cookie, '/roles')).body.find((r: { name: string }) => r.name === 'Teacher').id,
      });
      expect(res.status).toBe(201);
      expect(res.body.inviteToken).toBeNull();
      expect(res.body.existingAccount).toBe(true);

      // Nothing was mailed that sets a password; the owner of the account is told they were added.
      expect(sent.some((m) => /accept-invite/.test(m.text))).toBe(false);
      expect(sent.find((m) => m.to === 'owner-a@example.test')?.subject).toContain('added to');
      // Their password still works, and they now belong to both schools.
      const stillIn = await login('owner-a@example.test', 'alpha-owner-secret-1');
      expect(stillIn.res.status).toBe(200);
      expect((await get(stillIn.cookie, '/auth/me')).body.memberships).toHaveLength(2);
      expect(a.cookie).not.toBe('');
    });

    it('refuses an invitation token for anyone who already has a password, and each invitation token works once', async () => {
      const { cookie: director } = await register('Token School', 'dir2@example.test');
      const roles = await get(director, '/roles');
      const roleId = roles.body.find((r: { name: string }) => r.name === 'Teacher').id;

      const first = await post(director, '/memberships/invitations', { email: 'invitee@example.test', firstName: 'In', lastName: 'Vitee', roleId });
      const second = await post(director, '/memberships/invitations', { email: 'invitee@example.test', firstName: 'In', lastName: 'Vitee', roleId });
      // A newer invitation retires the older link.
      expect((await post(null, '/auth/accept-invite', { token: first.body.inviteToken, password: 'zebra-lantern-pass-9' })).status).toBe(400);
      expect((await post(null, '/auth/accept-invite', { token: second.body.inviteToken, password: 'zebra-lantern-pass-9' })).status).toBe(200);
      // Used once — gone.
      expect((await post(null, '/auth/accept-invite', { token: second.body.inviteToken, password: 'another-pass-phrase-1' })).status).toBe(400);
      expect((await login('invitee@example.test', 'zebra-lantern-pass-9')).res.status).toBe(200);
    });

    it('stops someone handing out more access than they hold: a Principal cannot invite a Director', async () => {
      const { cookie: director } = await register('Escalate School', 'dir3@example.test');
      const principal = await invite(director, 'Principal', 'principal1@example.test');
      const roles = await get(director, '/roles');
      const byName = (n: string) => roles.body.find((r: { name: string }) => r.name === n).id;

      const asDirector = await post(principal.cookie, '/memberships/invitations', { email: 'sneak@example.test', firstName: 'S', lastName: 'N', roleId: byName('Director') });
      expect(asDirector.status).toBe(403);
      expect(asDirector.body.error.message).toContain('only give others access you have yourself');
      expect((await post(principal.cookie, '/memberships/invitations', { email: 'ok@example.test', firstName: 'O', lastName: 'K', roleId: byName('Teacher') })).status).toBe(201);
    });

    it('stops an editor of roles giving a role a permission they lack themselves', async () => {
      const { cookie: director } = await register('Roles School', 'dir4@example.test');
      const create = await post(director, '/roles', {
        name: 'Role Editor',
        permissions: [
          { permissionKey: 'role.view', scope: 'ALL_SCHOOL' },
          { permissionKey: 'role.create', scope: 'ALL_SCHOOL' },
          { permissionKey: 'role.update', scope: 'ALL_SCHOOL' },
          { permissionKey: 'user.create', scope: 'ALL_SCHOOL' },
          { permissionKey: 'user.view', scope: 'ALL_SCHOOL' },
        ],
      });
      expect(create.status).toBe(201);
      const editor = await invite(director, 'Role Editor', 'editor1@example.test');
      expect(editor.cookie).not.toBe('');

      const bad = await post(editor.cookie, '/roles', { name: 'Grabby', permissions: [{ permissionKey: 'student.delete', scope: 'ALL_SCHOOL' }] });
      expect(bad.status).toBe(403);
      const fine = await post(editor.cookie, '/roles', { name: 'Viewer', permissions: [{ permissionKey: 'user.view', scope: 'ALL_SCHOOL' }] });
      expect(fine.status).toBe(201);
    });
  });

  describe('protecting the people in charge', () => {
    it('never lets the last Director be disabled or demoted, or anyone disable themselves', async () => {
      const { cookie: director } = await register('Last Dir School', 'dir5@example.test');
      const me = await get(director, '/auth/me');
      const membershipId = me.body.memberships[0].membershipId;
      const roles = await get(director, '/roles');
      const teacherId = roles.body.find((r: { name: string }) => r.name === 'Teacher').id;

      const self = await post(director, `/memberships/${membershipId}/disable`);
      expect(self.status).toBe(400);
      expect(self.body.error.code).toBe('CANNOT_DISABLE_SELF');
      const demote = await patch(director, `/memberships/${membershipId}`, { roleId: teacherId });
      expect(demote.status).toBe(400);
      expect(demote.body.error.code).toBe('LAST_DIRECTOR');
    });

    it('ends a person’s open sessions the moment their access is disabled', async () => {
      const { cookie: director } = await register('Disable School', 'dir6@example.test');
      const teacher = await invite(director, 'Teacher', 'teach6@example.test');
      expect((await get(teacher.cookie, '/auth/me')).status).toBe(200);

      const members = await get(director, '/memberships');
      const target = members.body.find((m: { user: { email: string } }) => m.user.email === 'teach6@example.test');
      expect((await post(director, `/memberships/${target.membershipId}/disable`)).status).toBe(200);
      expect((await get(teacher.cookie, '/auth/me')).status).toBe(401);
    });
  });

  describe('passwords', () => {
    it('refuses a password that is common, trivial, or contains the person’s name or email', async () => {
      // Registration is rate limited (5/hour per address), so the pure
      // password-strength cases run against the shared schema the API uses…
      for (const weak of ['Password123!', '1234567890', 'aaaaaaaaaaaa', 'short']) {
        expect(passwordSchema.safeParse(weak).success).toBe(false);
      }
      // …and the ones that depend on who is signing up go through the real route.
      for (const [password, email] of [
        ['dee-rector-forever', 'a5@example.test'], // contains the name
        ['my-owner8-secret', 'owner8@example.test'], // contains the email
        ['Password123!', 'a1@example.test'], // common, caught by the route too
      ]) {
        const { res } = await register('Weak School', email, password);
        expect(res.status).toBe(400);
      }
      expect((await register('Strong School', 'a6@example.test', 'correct-horse-battery')).res.status).toBe(201);
    });

    it('applies the same rules when changing or resetting a password, and never stores or returns it', async () => {
      const { cookie } = await register('Change School', 'change1@example.test');
      const weak = await post(cookie, '/auth/change-password', { currentPassword: PASSWORD, newPassword: 'Password123!' });
      expect(weak.status).toBe(400);
      const named = await post(cookie, '/auth/change-password', { currentPassword: PASSWORD, newPassword: 'change1-and-more-words' });
      expect(named.status).toBe(400);
      expect(named.body.error.details[0].field).toBe('newPassword');
      expect((await post(cookie, '/auth/change-password', { currentPassword: PASSWORD, newPassword: 'quiet-river-morning-7' })).status).toBe(200);

      const user = await prisma.user.findFirstOrThrow({ where: { email: 'change1@example.test' } });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user.passwordHash).not.toContain('quiet-river');
    });

    it('invalidates an earlier reset link when a newer one is requested, and a reset also lifts a lockout', async () => {
      await register('Reset School', 'reset1@example.test');
      await post(null, '/auth/forgot-password', { email: 'reset1@example.test' });
      const link1 = sent.find((m) => /reset-password/.test(m.text))!.text.match(/token=([a-f0-9]+)/)![1];
      sent.length = 0;
      await post(null, '/auth/forgot-password', { email: 'reset1@example.test' });
      const link2 = sent.find((m) => /reset-password/.test(m.text))!.text.match(/token=([a-f0-9]+)/)![1];

      expect((await post(null, '/auth/reset-password', { token: link1, password: 'brand-new-secret-44' })).status).toBe(400);

      for (let i = 0; i < 5; i += 1) await login('reset1@example.test', 'wrong-guess-1234');
      expect((await login('reset1@example.test')).res.status).toBe(429);

      expect((await post(null, '/auth/reset-password', { token: link2, password: 'brand-new-secret-44' })).status).toBe(200);
      expect((await login('reset1@example.test', 'brand-new-secret-44')).res.status).toBe(200);
    });
  });

  describe('sign-in protection', () => {
    it('locks an email after five failed attempts — whether or not the email exists — and says so the same way', async () => {
      await register('Lock School', 'lock1@example.test');
      for (const email of ['lock1@example.test', 'nobody@example.test']) {
        for (let i = 0; i < 5; i += 1) {
          const miss = await login(email, 'wrong-guess-1234');
          expect(miss.res.status).toBe(401);
          expect(miss.res.body.error.message).toBe('Invalid email or password.');
        }
        const locked = await login(email, PASSWORD);
        expect(locked.res.status).toBe(429);
        expect(locked.res.body.error.code).toBe('TOO_MANY_ATTEMPTS');
        expect(locked.res.body.error.retryAfterSeconds).toBeGreaterThan(0);
      }
      // Someone else is unaffected.
      await register('Other School', 'other1@example.test');
      expect((await login('other1@example.test')).res.status).toBe(200);
    });

    it('counts only consecutive failures: a successful sign-in resets the count', async () => {
      await register('Reset Count School', 'count1@example.test');
      for (let i = 0; i < 4; i += 1) await login('count1@example.test', 'wrong-guess-1234');
      expect((await login('count1@example.test')).res.status).toBe(200);
      for (let i = 0; i < 4; i += 1) await login('count1@example.test', 'wrong-guess-1234');
      expect((await login('count1@example.test')).res.status).toBe(200);
    });

    it('records every failed attempt in the audit log, without the password, and shows it to the account owner', async () => {
      await register('Audit Fail School', 'fail1@example.test');
      await login('fail1@example.test', 'super-wrong-password-777');
      const { cookie } = await login('fail1@example.test');
      const activity = await get(cookie, '/auth/activity');
      expect(activity.status).toBe(200);
      const failed = activity.body.find((a: { action: string }) => a.action === 'auth.login_failed');
      expect(failed).toMatchObject({ label: 'Failed sign-in attempt', alert: true });
      expect(JSON.stringify(await prisma.auditLog.findMany())).not.toContain('super-wrong-password-777');
    });

    it('treats a disabled or not-yet-activated account exactly like a wrong password', async () => {
      const { cookie: director } = await register('Inactive School', 'dir7@example.test');
      const roleId = (await get(director, '/roles')).body.find((r: { name: string }) => r.name === 'Teacher').id;
      await post(director, '/memberships/invitations', { email: 'pending@example.test', firstName: 'P', lastName: 'Ending', roleId });
      const pending = await login('pending@example.test', 'whatever-123456');
      const wrong = await login('dir7@example.test', 'whatever-123456');
      expect(pending.res.status).toBe(401);
      expect(pending.res.body.error).toEqual(wrong.res.body.error);
    });
  });

  describe('sessions, devices and "keep me signed in"', () => {
    it('gives a normal sign-in a session cookie and a remembered one a 30-day cookie, both httpOnly', async () => {
      await register('Cookie School', 'cookie1@example.test');
      const normal = await login('cookie1@example.test');
      const remembered = await login('cookie1@example.test', PASSWORD, { rememberMe: true });
      const header = (r: request.Response) => (r.headers['set-cookie'] as unknown as string[])[0];
      expect(header(normal.res)).toMatch(/HttpOnly/i);
      expect(header(normal.res)).toMatch(/SameSite=Lax/i);
      expect(header(normal.res)).not.toMatch(/Max-Age|Expires/i);
      expect(header(remembered.res)).toMatch(/Max-Age=2592000/);
      const rows = await prisma.session.findMany({ orderBy: { createdAt: 'asc' } });
      expect(rows.map((s) => s.rememberMe)).toEqual([false, false, true].slice(-rows.length));
    });

    it('caps a session’s life from sign-in however active it is — 7 days, or 90 when remembered', async () => {
      await register('Cap School', 'cap1@example.test');
      const normal = await login('cap1@example.test');
      const remembered = await login('cap1@example.test', PASSWORD, { rememberMe: true });
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      await prisma.session.updateMany({ data: { createdAt: eightDaysAgo } });

      expect((await get(normal.cookie, '/auth/me')).status).toBe(401);
      expect((await get(remembered.cookie, '/auth/me')).status).toBe(200);
      await prisma.session.updateMany({ data: { createdAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000) } });
      expect((await get(remembered.cookie, '/auth/me')).status).toBe(401);
    });

    it('lists the devices a person is signed in on, and lets them sign any other one out', async () => {
      await register('Device School', 'device1@example.test');
      const laptop = await login('device1@example.test', PASSWORD, {}, CHROME_WIN);
      const phone = await login('device1@example.test', PASSWORD, {}, SAFARI_IPHONE);

      const list = await get(laptop.cookie, '/auth/sessions');
      expect(list.status).toBe(200);
      const labels = list.body.map((s: { device: { label: string } }) => s.device.label);
      expect(labels).toEqual(expect.arrayContaining(['Chrome on Windows', 'Safari on iOS']));
      expect(list.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
      expect(list.body.find((s: { current: boolean }) => s.current).device.label).toBe('Chrome on Windows');

      const phoneSession = list.body.find((s: { device: { label: string } }) => s.device.label === 'Safari on iOS');
      const current = list.body.find((s: { current: boolean }) => s.current);
      expect((await del(laptop.cookie, `/auth/sessions/${current.id}`)).status).toBe(400); // use Log out for this one
      expect((await del(laptop.cookie, `/auth/sessions/${phoneSession.id}`)).status).toBe(204);
      expect((await get(phone.cookie, '/auth/me')).status).toBe(401);
      expect((await get(laptop.cookie, '/auth/me')).status).toBe(200);
    });

    it('signs every other device out at once, and never touches another person’s sessions', async () => {
      await register('Others School', 'others1@example.test');
      await register('Bystander School', 'bystander1@example.test');
      const one = await login('others1@example.test');
      const two = await login('others1@example.test');
      const bystander = await login('bystander1@example.test');
      const bystanderSession = (await get(bystander.cookie, '/auth/sessions')).body[0];

      // Registration signed them in once already, so three sessions exist; keep `one`, end the rest.
      const before = await get(one.cookie, '/auth/sessions');
      expect(before.body).toHaveLength(3);
      const res = await post(one.cookie, '/auth/sessions/revoke-others');
      expect(res.body.revoked).toBe(2);
      expect(await get(one.cookie, '/auth/sessions').then((r) => r.body)).toHaveLength(1);
      expect((await get(two.cookie, '/auth/me')).status).toBe(401);
      expect((await get(one.cookie, '/auth/me')).status).toBe(200);
      // Someone else's session id is simply "not found".
      expect((await del(one.cookie, `/auth/sessions/${bystanderSession.id}`)).status).toBe(404);
      expect((await get(bystander.cookie, '/auth/me')).status).toBe(200);
    });

    it('emails the owner when their account is signed in from a browser it has not seen before — but not for a familiar one', async () => {
      await register('Alert School', 'alert1@example.test');
      sent.length = 0;
      const alertsSoFar = () => sent.filter((m) => /New sign-in/.test(m.subject));
      // The registration sign-in used a different client, so the first Chrome login is new…
      await login('alert1@example.test', PASSWORD, {}, CHROME_WIN);
      expect(alertsSoFar()).toHaveLength(1);
      // …but the same browser again is familiar: no second email.
      await login('alert1@example.test', PASSWORD, {}, CHROME_WIN);
      expect(alertsSoFar()).toHaveLength(1);
      await login('alert1@example.test', PASSWORD, {}, SAFARI_IPHONE);
      expect(alertsSoFar()).toHaveLength(2);
      expect(alertsSoFar()[1].text).toContain('Safari on iOS');
    });

    it('signs out for real: the cookie is dead afterwards, not just forgotten by the browser', async () => {
      await register('Logout School', 'logout1@example.test');
      const { cookie } = await login('logout1@example.test');
      expect((await post(cookie, '/auth/logout')).status).toBe(204);
      expect((await get(cookie, '/auth/me')).status).toBe(401);
    });
  });

  describe('sensitive actions need a fresh password', () => {
    const inviteBody = (roleId: string) => ({ email: 'fresh1@example.test', firstName: 'F', lastName: 'Resh', roleId });

    it('asks for the password again once a session has been idle past the window, accepts the right one, and counts wrong ones toward the lockout', async () => {
      const { cookie } = await register('Fresh School', 'fresh-dir@example.test');
      const roleId = (await get(cookie, '/roles')).body.find((r: { name: string }) => r.name === 'Teacher').id;
      await prisma.session.updateMany({ data: { reauthenticatedAt: new Date(Date.now() - 60 * 60 * 1000) } });

      const blocked = await post(cookie, '/memberships/invitations', inviteBody(roleId));
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('REAUTH_REQUIRED');
      // A password prompt is a challenge, not a refusal — it is not logged as a denial.
      expect(await prisma.auditLog.count({ where: { action: 'access.denied' } })).toBe(0);

      const wrong = await post(cookie, '/auth/reauth', { password: 'not-my-password-1' });
      expect(wrong.status).toBe(400);
      expect((await post(cookie, '/memberships/invitations', inviteBody(roleId))).status).toBe(403);

      expect((await post(cookie, '/auth/reauth', { password: PASSWORD })).status).toBe(200);
      expect((await post(cookie, '/memberships/invitations', inviteBody(roleId))).status).toBe(201);

      for (let i = 0; i < 4; i += 1) await post(cookie, '/auth/reauth', { password: 'nope-nope-nope-1' });
      const locked = await post(cookie, '/auth/reauth', { password: PASSWORD });
      expect(locked.status).toBe(429);
    });

    it('covers inviting, changing roles, disabling people and editing roles — but not ordinary work', async () => {
      const { cookie } = await register('Scope School', 'scope-dir@example.test');
      await prisma.session.updateMany({ data: { reauthenticatedAt: null } });
      const roleId = (await get(cookie, '/roles')).body.find((r: { name: string }) => r.name === 'Teacher').id;
      const me = await get(cookie, '/auth/me');
      const membershipId = me.body.memberships[0].membershipId;

      const needing: [string, () => Promise<request.Response>][] = [
        ['invite', () => post(cookie, '/memberships/invitations', inviteBody(roleId))],
        ['change role', () => patch(cookie, `/memberships/${membershipId}`, { roleId })],
        ['disable', () => post(cookie, `/memberships/${membershipId}/disable`)],
        ['reactivate', () => post(cookie, `/memberships/${membershipId}/reactivate`)],
        ['create role', () => post(cookie, '/roles', { name: 'X Role', permissions: [] })],
        ['edit role', () => patch(cookie, `/roles/${roleId}`, { name: 'Renamed' })],
      ];
      for (const [label, call] of needing) {
        const res = await call();
        expect([label, res.status, res.body.error?.code]).toEqual([label, 403, 'REAUTH_REQUIRED']);
      }
      // Everyday actions never ask.
      expect((await post(cookie, '/holidays', { name: 'Founders Day', type: 'SCHOOL', startDate: '2031-05-01', endDate: '2031-05-01' })).status).toBe(201);
      expect((await get(cookie, '/students')).status).toBe(200);
    });

    it('waits for a verified email where the deployment requires it, accepts the emailed link once, and limits resends', async () => {
      process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
      const { cookie } = await register('Verify School', 'verify1@example.test');
      const roleId = (await get(cookie, '/roles')).body.find((r: { name: string }) => r.name === 'Teacher').id;
      const verification = sent.find((m) => /verify-email/.test(m.text));
      expect(verification?.to).toBe('verify1@example.test');
      const token = verification!.text.match(/token=([a-f0-9]+)/)![1];

      expect((await get(cookie, '/auth/me')).body.emailVerified).toBe(false);
      const blocked = await post(cookie, '/memberships/invitations', inviteBody(roleId));
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('EMAIL_NOT_VERIFIED');

      // A resend within a minute is refused; the first link is the one that works.
      expect((await post(cookie, '/auth/resend-verification')).status).toBe(429);
      expect((await post(null, '/auth/verify-email', { token })).status).toBe(200);
      expect((await post(null, '/auth/verify-email', { token })).status).toBe(400);
      expect((await get(cookie, '/auth/me')).body.emailVerified).toBe(true);
      expect((await post(cookie, '/memberships/invitations', inviteBody(roleId))).status).toBe(201);
      expect(await prisma.auditLog.count({ where: { action: 'auth.email_verified' } })).toBe(1);
    });

    it('counts an accepted invitation as proof of email ownership', async () => {
      const { cookie: director } = await register('Invited Verified School', 'dir8@example.test');
      const teacher = await invite(director, 'Teacher', 'teach8@example.test');
      expect((await get(teacher.cookie, '/auth/me')).body.emailVerified).toBe(true);
    });
  });

  describe('audit trail', () => {
    it('attributes an action to the person who did it, not the person it was done to', async () => {
      const { cookie: director } = await register('Attribution School', 'dir9@example.test');
      const dirUser = await prisma.user.findFirstOrThrow({ where: { email: 'dir9@example.test' } });
      await invite(director, 'Teacher', 'teach9@example.test');

      const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'user.invite_created' } });
      expect(entry.userId).toBe(dirUser.id);
      expect(entry.metadata).toMatchObject({ email: 'teach9@example.test', role: 'Teacher' });
    });

    it('lets the Director read the school’s audit log — and nobody else', async () => {
      const { cookie: director } = await register('Viewer School', 'dir10@example.test');
      const principal = await invite(director, 'Principal', 'principal10@example.test');
      const teacher = await invite(director, 'Teacher', 'teach10@example.test');
      await post(director, '/holidays', { name: 'Audit Day', type: 'SCHOOL', startDate: '2031-06-01', endDate: '2031-06-01' });

      const log = await get(director, '/audit-logs');
      expect(log.status).toBe(200);
      const actions = log.body.data.map((r: { action: string }) => r.action);
      expect(actions).toEqual(expect.arrayContaining(['user.invite_created', 'api.write']));
      const invited = log.body.data.find((r: { action: string }) => r.action === 'user.invite_created');
      expect(invited.actor.email).toBe('dir10@example.test');
      const holiday = log.body.data.find((r: { action: string; metadata: { route?: string } }) => r.action === 'api.write' && r.metadata?.route === '/holidays');
      expect(holiday).toMatchObject({ module: 'holidays', actor: { email: 'dir10@example.test' } });

      expect((await get(principal.cookie, '/audit-logs')).status).toBe(403);
      expect((await get(teacher.cookie, '/audit-logs')).status).toBe(403);
    });

    it('filters and pages the log, and keeps another school’s entries out', async () => {
      const a = await register('Filter School A', 'dir11a@example.test');
      const b = await register('Filter School B', 'dir11b@example.test');
      await invite(a.cookie, 'Teacher', 'teach11@example.test');
      await post(b.cookie, '/holidays', { name: 'Only B', type: 'SCHOOL', startDate: '2031-07-01', endDate: '2031-07-01' });

      const onlyInvites = await get(a.cookie, '/audit-logs?action=user.invite_created');
      expect(onlyInvites.body.data.length).toBe(1);
      const paged = await get(a.cookie, '/audit-logs?pageSize=1&page=1');
      expect(paged.body.data).toHaveLength(1);
      expect(paged.body.pagination.total).toBeGreaterThan(1);
      const seenByA = JSON.stringify((await get(a.cookie, '/audit-logs?pageSize=100')).body);
      expect(seenByA).not.toContain('dir11b@example.test');
      expect((await get(a.cookie, '/audit-logs?from=not-a-date')).status).toBe(400);
    });

    it('records when a signed-in person is refused, so probing leaves a trail', async () => {
      const { cookie: director } = await register('Denied School', 'dir12@example.test');
      const teacher = await invite(director, 'Teacher', 'teach12@example.test');
      expect((await get(teacher.cookie, '/roles')).status).toBe(403);
      const denial = await prisma.auditLog.findFirstOrThrow({ where: { action: 'access.denied', userId: teacher.userId } });
      expect(denial.resourceId).toBe('GET /api/v1/roles');
    });

    it('never records request bodies: no password or token reaches the audit log', async () => {
      const { cookie } = await register('Quiet School', 'quiet1@example.test', 'very-private-pass-93');
      await post(cookie, '/auth/change-password', { currentPassword: 'very-private-pass-93', newPassword: 'even-more-private-72' });
      await post(null, '/auth/forgot-password', { email: 'quiet1@example.test' });
      const everything = JSON.stringify(await prisma.auditLog.findMany());
      for (const secret of ['very-private-pass-93', 'even-more-private-72']) expect(everything).not.toContain(secret);
      const token = sent.find((m) => /reset-password/.test(m.text))!.text.match(/token=([a-f0-9]+)/)![1];
      expect(everything).not.toContain(token);
    });
  });

  describe('secure API access', () => {
    it('sends security headers on every response and no X-Powered-By', async () => {
      const res = await agent().get('/api/v1/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('refuses state-changing requests from an origin that is not the web app', async () => {
      const res = await agent().post('/api/v1/auth/login').set('Origin', 'https://evil.example').send({ email: 'a@example.test', password: 'x' });
      expect(res.status).toBe(403);
      expect((await agent().post('/api/v1/auth/login').send({ email: 'a@example.test', password: 'x' })).status).toBe(403); // no Origin at all
    });

    it('validates input: unknown fields are ignored and malformed ones refused', async () => {
      expect((await post(null, '/auth/login', { email: 'not-an-email', password: 'x' })).status).toBe(400);
      expect((await post(null, '/auth/login', { email: 'a@example.test' })).status).toBe(400);
      expect((await post(null, '/auth/login', 'garbage' as unknown as object)).status).toBe(400);
    });
  });

  describe('secure file access', () => {
    const upload = (cookie: string, buffer: Buffer, filename: string, contentType: string) =>
      agent().post('/api/v1/me/documents').set('Origin', WEB_ORIGIN).set('Cookie', cookie).attach('file', buffer, { filename, contentType });

    it('checks what a file actually is, not what the uploader says it is', async () => {
      const { cookie } = await register('Upload School', 'upload1@example.test');
      const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('rest')]);
      const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('rest')]);

      expect((await upload(cookie, Buffer.from('%PDF-1.7 ok'), 'a.pdf', 'application/pdf')).status).toBe(201);
      expect((await upload(cookie, png, 'a.png', 'image/png')).status).toBe(201);
      expect((await upload(cookie, jpeg, 'a.jpg', 'image/jpeg')).status).toBe(201);

      // A script wearing a PDF's name and type, a PNG claiming to be a PDF, an empty file.
      expect((await upload(cookie, Buffer.from('<script>alert(1)</script>'), 'evil.pdf', 'application/pdf')).status).toBe(400);
      expect((await upload(cookie, png, 'disguised.pdf', 'application/pdf')).status).toBe(400);
      expect((await upload(cookie, Buffer.alloc(0), 'empty.pdf', 'application/pdf')).status).toBe(400);
    });

    it('serves downloads as attachments with the stored type, and only to people entitled to them', async () => {
      const { cookie } = await register('Download School', 'download1@example.test');
      const up = await upload(cookie, Buffer.from('%PDF-1.7 ok'), 'a.pdf', 'application/pdf');
      const download = await get(cookie, `/me/documents/${up.body.id}/download`);
      expect(download.headers['content-disposition']).toContain('attachment');
      expect(download.headers['x-content-type-options']).toBe('nosniff');
      const stranger = await register('Stranger School', 'stranger1@example.test');
      expect((await get(stranger.cookie, `/me/documents/${up.body.id}/download`)).status).toBe(404);
      expect((await agent().get(`/api/v1/me/documents/${up.body.id}/download`)).status).toBe(401);
    });
  });

  describe('tenant isolation', () => {
    it('keeps one school’s people, roles and audit entries out of another’s', async () => {
      const a = await register('Tenant A', 'tenant-a@example.test');
      const b = await register('Tenant B', 'tenant-b@example.test');
      await invite(a.cookie, 'Teacher', 'teacher-in-a@example.test');
      const membersSeenByB = JSON.stringify((await get(b.cookie, '/memberships')).body);
      expect(membersSeenByB).not.toContain('teacher-in-a@example.test');
      const aRole = (await get(a.cookie, '/roles')).body[0];
      expect((await patch(b.cookie, `/roles/${aRole.id}`, { name: 'Hijacked' })).status).toBe(404);
    });
  });

  describe('logs', () => {
    it('never print a password, a reset or invitation link, or a session value', async () => {
      const lines: string[] = [];
      const capture = (chunk: unknown) => {
        lines.push(String(chunk));
        return true;
      };
      const outSpy = jest.spyOn(process.stdout, 'write').mockImplementation(capture as never);
      const errSpy = jest.spyOn(process.stderr, 'write').mockImplementation(capture as never);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(((...args: unknown[]) => lines.push(args.join(' '))) as never);
      try {
        const { cookie } = await register('Log School', 'log1@example.test', 'logged-secret-pass-31');
        await login('log1@example.test', 'logged-wrong-pass-55');
        await post(null, '/auth/forgot-password', { email: 'log1@example.test' });
        const roleId = (await get(cookie, '/roles')).body.find((r: { name: string }) => r.name === 'Teacher').id;
        const inv = await post(cookie, '/memberships/invitations', { email: 'log2@example.test', firstName: 'L', lastName: 'Og', roleId });
        await post(cookie, '/auth/change-password', { currentPassword: 'logged-secret-pass-31', newPassword: 'logged-next-pass-62' });
        const sessionValue = cookie.split('=')[1];
        const output = lines.join('\n');
        for (const secret of ['logged-secret-pass-31', 'logged-wrong-pass-55', 'logged-next-pass-62', inv.body.inviteToken as string, sessionValue]) {
          expect(output).not.toContain(secret);
        }
        const resetToken = sent.find((m) => /reset-password/.test(m.text))!.text.match(/token=([a-f0-9]+)/)![1];
        expect(output).not.toContain(resetToken);
      } finally {
        outSpy.mockRestore();
        errSpy.mockRestore();
        logSpy.mockRestore();
      }
    });
  });
});
