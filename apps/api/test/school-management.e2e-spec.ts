import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetTestData } from './db-helpers';
import { permissionCatalog } from '../prisma/seed-data/permissions';
import { currentYearDates, nextYearDates } from './year-helpers';

// End-to-end tests for Phase 5 (School Management): registration,
// settings, roles, memberships/invitations, and academic years — all
// through the real HTTP stack (guards, pipes, filters), proving tenant
// isolation the same way Phase 4's students.e2e-spec.ts did, now against
// several real resource types instead of just one.
//
// A fresh Nest app is bootstrapped PER TEST (not once for the whole
// file): registration's ThrottlerGuard is correctly IP-keyed (there's no
// email to key on before an account exists), and this suite registers
// several schools per test across ~18 tests — sharing one app's
// throttler storage would mean later tests silently inherit quota
// consumed by earlier ones, tripping the real 5/hour limit by accident
// and failing in a way that depends on test order and count, not on the
// behavior actually being tested. A fresh app means fresh storage.

const WEB_ORIGIN = 'http://localhost:3000';

describe('School Management (e2e)', () => {
  let app: INestApplication;
  // Standalone client for one-time permission seeding and for DB
  // cleanup, independent of any particular test's app instance.
  const seedClient = new PrismaClient();

  beforeAll(async () => {
    for (const permission of permissionCatalog) {
      await seedClient.permission.upsert({ where: { key: permission.key }, update: {}, create: permission });
    }
  });

  afterAll(async () => {
    await seedClient.$disconnect();
  });

  beforeEach(async () => {
    await resetTestData(seedClient);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const agent = () => request(app.getHttpServer());

  async function registerSchool(schoolName: string, email: string, password = 'correct-horse-battery') {
    const res = await agent()
      .post('/api/v1/schools/register')
      .set('Origin', WEB_ORIGIN)
      .send({ schoolName, directorFirstName: 'D', directorLastName: 'R', email, password });
    return { schoolId: res.body.schoolId as string, cookie: res.headers['set-cookie'], status: res.status };
  }

  describe('POST /schools/register', () => {
    it('creates a school, seeds default roles, and auto-logs in with an active school selected', async () => {
      const { schoolId, cookie, status } = await registerSchool('Sunrise School', 'director1@example.test');
      expect(status).toBe(201);

      const me = await agent().get('/api/v1/auth/me').set('Cookie', cookie);
      expect(me.body.memberships[0].schoolId).toBe(schoolId);

      // No select-school call needed — registration already selected it.
      const school = await agent().get('/api/v1/schools/me').set('Cookie', cookie);
      expect(school.status).toBe(200);
      expect(school.body.id).toBe(schoolId);

      const roles = await agent().get('/api/v1/roles').set('Cookie', cookie);
      expect(roles.body.map((r: { name: string }) => r.name).sort()).toEqual([
        'Accountant',
        'Director',
        'Parent',
        'Principal',
        'Receptionist',
        'Teacher',
      ]);
    });

    it('rejects a duplicate email with 409', async () => {
      await registerSchool('School One', 'dup@example.test');
      const second = await registerSchool('School Two', 'dup@example.test');
      expect(second.status).toBe(409);
    });

  });

  describe('School settings', () => {
    it('saves regional settings and rejects an unknown time zone or malformed currency', async () => {
      const { cookie } = await registerSchool('Regional School', 'regional1@example.test');
      const patch = (body: object) => agent().patch('/api/v1/schools/me').set('Origin', WEB_ORIGIN).set('Cookie', cookie).send(body);

      const ok = await patch({ timezone: 'America/New_York', currency: 'USD', dateFormat: 'MM/DD/YYYY' });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ timezone: 'America/New_York', currency: 'USD', dateFormat: 'MM/DD/YYYY' });

      expect((await patch({ timezone: 'Mars/Olympus_Mons' })).status).toBe(400);
      expect((await patch({ currency: 'dollars' })).status).toBe(400);
      const school = await agent().get('/api/v1/schools/me').set('Cookie', cookie);
      expect(school.body.timezone).toBe('America/New_York'); // unchanged by the rejected requests
    });

    it('saves staff working hours and rejects nonsense times', async () => {
      const { cookie } = await registerSchool('Hours School', 'hours1@example.test');
      const patch = (body: object) => agent().patch('/api/v1/schools/me').set('Origin', WEB_ORIGIN).set('Cookie', cookie).send(body);

      const before = await agent().get('/api/v1/schools/me').set('Cookie', cookie);
      expect(before.body).toMatchObject({ staffPunchInTime: '09:00', staffPunchOutTime: '16:00', staffLateGraceMinutes: 10 });

      const ok = await patch({ staffPunchInTime: '08:30', staffPunchOutTime: '15:45', staffLateGraceMinutes: 5 });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ staffPunchInTime: '08:30', staffPunchOutTime: '15:45', staffLateGraceMinutes: 5 });

      for (const bad of [
        { staffPunchInTime: '25:00' },
        { staffPunchInTime: '9am' },
        { staffPunchOutTime: '16:60' },
        { staffPunchInTime: '17:00', staffPunchOutTime: '09:00' }, // out before in
        { staffPunchInTime: '10:00', staffPunchOutTime: '10:00' },
        { staffPunchInTime: '17:00' }, // later than the saved punch-out (15:45)
        { staffPunchOutTime: '08:00' }, // earlier than the saved punch-in (08:30)
        { staffLateGraceMinutes: -1 },
        { staffLateGraceMinutes: 500 },
      ]) {
        expect((await patch(bad)).status).toBe(400);
      }
      const after = await agent().get('/api/v1/schools/me').set('Cookie', cookie);
      expect(after.body.staffPunchInTime).toBe('08:30'); // untouched by the rejected requests
    });

    it('stores the school country, exposes it on /auth/me for every role, and rejects a fake country', async () => {
      const reg = await agent()
        .post('/api/v1/schools/register')
        .set('Origin', WEB_ORIGIN)
        .send({ schoolName: 'Country School', directorFirstName: 'D', directorLastName: 'R', email: 'country1@example.test', password: 'correct-horse-battery', country: 'US' });
      expect(reg.status).toBe(201);
      const cookie = reg.headers['set-cookie'] as unknown as string;
      const me = () => agent().get('/api/v1/auth/me').set('Cookie', cookie);
      expect((await me()).body.schoolCountry).toBe('US');

      const patch = (body: object) => agent().patch('/api/v1/schools/me').set('Origin', WEB_ORIGIN).set('Cookie', cookie).send(body);
      expect((await patch({ country: 'GB' })).body.country).toBe('GB');
      expect((await me()).body.schoolCountry).toBe('GB');
      expect((await patch({ country: 'ZZ' })).status).toBe(400);
      expect((await patch({ country: 'india' })).status).toBe(400);
    });

    it('defaults the country to India when registration does not say', async () => {
      const { cookie } = await registerSchool('Default Country School', 'country2@example.test');
      expect((await agent().get('/api/v1/auth/me').set('Cookie', cookie)).body.schoolCountry).toBe('IN');
    });

    it('allows the director to update settings', async () => {
      const { cookie } = await registerSchool('Settings School', 'settings1@example.test');
      const res = await agent()
        .patch('/api/v1/schools/me')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ contactPhone: '+91-9999999999' });
      expect(res.status).toBe(200);
      expect(res.body.contactPhone).toBe('+91-9999999999');
    });

    it("403s a role without school.update (e.g. a freshly invited Teacher)", async () => {
      const { cookie: directorCookie } = await registerSchool('Perm School', 'perm1@example.test');
      const roles = await agent().get('/api/v1/roles').set('Cookie', directorCookie);
      const teacherRole = roles.body.find((r: { name: string }) => r.name === 'Teacher');

      const invite = await agent()
        .post('/api/v1/memberships/invitations')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', directorCookie)
        .send({ email: 'teacher-perm@example.test', firstName: 'T', lastName: 'P', roleId: teacherRole.id });

      await agent()
        .post('/api/v1/auth/accept-invite')
        .set('Origin', WEB_ORIGIN)
        .send({ token: invite.body.inviteToken, password: 'teacher-pass-123' });
      const teacherLogin = await agent()
        .post('/api/v1/auth/login')
        .set('Origin', WEB_ORIGIN)
        .send({ email: 'teacher-perm@example.test', password: 'teacher-pass-123' });
      const teacherCookie = teacherLogin.headers['set-cookie'];

      const res = await agent()
        .patch('/api/v1/schools/me')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', teacherCookie)
        .send({ contactPhone: '+91-1111111111' });
      expect(res.status).toBe(403);
    });
  });

  describe('Roles', () => {
    it('creates a custom role with specific permission grants', async () => {
      const { cookie } = await registerSchool('Custom Role School', 'customrole1@example.test');
      const res = await agent()
        .post('/api/v1/roles')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({
          name: 'Librarian-in-training',
          permissions: [{ permissionKey: 'student.view', scope: 'ALL_SCHOOL', readOnly: true }],
        });
      expect(res.status).toBe(201);
      expect(res.body.permissions).toEqual([
        { permissionKey: 'student.view', scope: 'ALL_SCHOOL', readOnly: true },
      ]);
    });

    it('rejects a duplicate role name with 409', async () => {
      const { cookie } = await registerSchool('Dup Role School', 'duprole1@example.test');
      const res = await agent()
        .post('/api/v1/roles')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ name: 'Director', permissions: [] }); // "Director" already seeded
      expect(res.status).toBe(409);
    });

    it('rejects an unknown permission key with 400', async () => {
      const { cookie } = await registerSchool('Bad Perm School', 'badperm1@example.test');
      const res = await agent()
        .post('/api/v1/roles')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ name: 'Weird Role', permissions: [{ permissionKey: 'not.a.real.permission', scope: 'ALL_SCHOOL' }] });
      expect(res.status).toBe(400);
    });

    it("404s when School B tries to update School A's role (cross-tenant)", async () => {
      const schoolA = await registerSchool('School A Roles', 'schoolA-roles@example.test');
      const schoolB = await registerSchool('School B Roles', 'schoolB-roles@example.test');
      const rolesA = await agent().get('/api/v1/roles').set('Cookie', schoolA.cookie);
      const roleAId = rolesA.body[0].id;

      const res = await agent()
        .patch(`/api/v1/roles/${roleAId}`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', schoolB.cookie)
        .send({ name: 'Hijacked' });
      expect(res.status).toBe(404);
    });

    it('updates a custom role: renames it and replaces its permission grants', async () => {
      const { cookie } = await registerSchool('Edit Role School', 'editrole1@example.test');
      const created = await agent()
        .post('/api/v1/roles')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ name: 'Front Desk', permissions: [{ permissionKey: 'student.view', scope: 'ALL_SCHOOL' }] });

      const res = await agent()
        .patch(`/api/v1/roles/${created.body.id}`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({
          name: 'Front Office',
          permissions: [
            { permissionKey: 'student.view', scope: 'OWN_CLASS', readOnly: true },
            { permissionKey: 'holiday.create', scope: 'ALL_SCHOOL' },
          ],
        });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Front Office');
      expect(res.body.permissions).toEqual(
        expect.arrayContaining([
          { permissionKey: 'student.view', scope: 'OWN_CLASS', readOnly: true },
          { permissionKey: 'holiday.create', scope: 'ALL_SCHOOL', readOnly: false },
        ]),
      );
      expect(res.body.permissions).toHaveLength(2);
    });

    it('refuses to edit the built-in Director role (it must always keep full access)', async () => {
      const { cookie } = await registerSchool('Director Guard School', 'directorguard1@example.test');
      const roles = await agent().get('/api/v1/roles').set('Cookie', cookie);
      const director = roles.body.find((r: { name: string }) => r.name === 'Director');

      const res = await agent()
        .patch(`/api/v1/roles/${director.id}`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ permissions: [] });
      expect(res.status).toBe(400);

      const after = await agent().get('/api/v1/roles').set('Cookie', cookie);
      const unchanged = after.body.find((r: { name: string }) => r.name === 'Director');
      expect(unchanged.permissions.length).toBe(director.permissions.length);
    });

    it('lists the permission catalog for the role editor', async () => {
      const { cookie } = await registerSchool('Catalog School', 'catalog1@example.test');
      const res = await agent().get('/api/v1/permissions').set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.some((p: { key: string }) => p.key === 'student.view')).toBe(true);
    });
  });

  describe('Memberships / invitations', () => {
    it('invites a staff member, who can accept and log in', async () => {
      const { cookie } = await registerSchool('Invite School', 'invite1@example.test');
      const roles = await agent().get('/api/v1/roles').set('Cookie', cookie);
      const accountantRole = roles.body.find((r: { name: string }) => r.name === 'Accountant');

      const invite = await agent()
        .post('/api/v1/memberships/invitations')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ email: 'newstaff@example.test', firstName: 'N', lastName: 'S', roleId: accountantRole.id });
      expect(invite.status).toBe(201);
      expect(invite.body.inviteToken).toBeTruthy();

      await agent()
        .post('/api/v1/auth/accept-invite')
        .set('Origin', WEB_ORIGIN)
        .send({ token: invite.body.inviteToken, password: 'fresh-start-pass-123' });

      const login = await agent()
        .post('/api/v1/auth/login')
        .set('Origin', WEB_ORIGIN)
        .send({ email: 'newstaff@example.test', password: 'fresh-start-pass-123' });
      expect(login.status).toBe(200);
    });

    it('lists all memberships for the school', async () => {
      const { cookie } = await registerSchool('List Members School', 'listmembers1@example.test');
      const res = await agent().get('/api/v1/memberships').set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1); // just the director so far
      expect(res.body[0].role.name).toBe('Director');
    });

    it('exports the staff list as CSV', async () => {
      const { cookie } = await registerSchool('Export Members School', 'exportmembers1@example.test');
      const res = await agent().get('/api/v1/memberships/export').set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('staff.csv');
      expect(res.text).toContain('First Name');
      expect(res.text).toContain('Director');
    });

    it('disabling a membership blocks further school-scoped access on that session', async () => {
      const { cookie: directorCookie } = await registerSchool('Disable School', 'disable1@example.test');
      const roles = await agent().get('/api/v1/roles').set('Cookie', directorCookie);
      const teacherRole = roles.body.find((r: { name: string }) => r.name === 'Teacher');

      const invite = await agent()
        .post('/api/v1/memberships/invitations')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', directorCookie)
        .send({ email: 'disableme@example.test', firstName: 'D', lastName: 'M', roleId: teacherRole.id });
      await agent()
        .post('/api/v1/auth/accept-invite')
        .set('Origin', WEB_ORIGIN)
        .send({ token: invite.body.inviteToken, password: 'disable-pass-123' });
      const login = await agent()
        .post('/api/v1/auth/login')
        .set('Origin', WEB_ORIGIN)
        .send({ email: 'disableme@example.test', password: 'disable-pass-123' });
      const teacherCookie = login.headers['set-cookie'];

      const members = await agent().get('/api/v1/memberships').set('Cookie', directorCookie);
      const membershipId = members.body.find(
        (m: { user: { email: string } }) => m.user.email === 'disableme@example.test',
      ).membershipId;

      const disableRes = await agent()
        .post(`/api/v1/memberships/${membershipId}/disable`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', directorCookie);
      expect(disableRes.status).toBe(200);

      // The teacher's session cookie is still "valid" (user not disabled,
      // only the membership) but school-scoped access must now fail.
      const res = await agent().get('/api/v1/roles').set('Cookie', teacherCookie);
      expect(res.status).toBe(403);
    });

    it("404s when School B tries to disable School A's membership (cross-tenant)", async () => {
      const schoolA = await registerSchool('School A Members', 'schoolA-members@example.test');
      const schoolB = await registerSchool('School B Members', 'schoolB-members@example.test');
      const membersA = await agent().get('/api/v1/memberships').set('Cookie', schoolA.cookie);
      const membershipAId = membersA.body[0].membershipId;

      const res = await agent()
        .post(`/api/v1/memberships/${membershipAId}/disable`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', schoolB.cookie);
      expect(res.status).toBe(404);
    });
  });

  describe('Academic years', () => {
    it('creates the first academic year as current automatically', async () => {
      const { cookie } = await registerSchool('AY School', 'ay1@example.test');
      const res = await agent()
        .post('/api/v1/academic-years')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ name: '2025-26', ...currentYearDates() });
      expect(res.status).toBe(201);
      expect(res.body.isCurrent).toBe(true);
    });

    it('setting a new year current un-sets the previous one', async () => {
      const { cookie } = await registerSchool('AY Switch School', 'ay2@example.test');
      const first = await agent()
        .post('/api/v1/academic-years')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ name: '2025-26', ...currentYearDates() });
      const second = await agent()
        .post('/api/v1/academic-years')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ name: '2026-27', ...nextYearDates() });
      expect(second.body.isCurrent).toBe(false); // first one already claimed "current"

      await agent()
        .post(`/api/v1/academic-years/${second.body.id}/set-current`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie);

      const list = await agent().get('/api/v1/academic-years').set('Cookie', cookie);
      const byId = Object.fromEntries(list.body.map((y: { id: string; isCurrent: boolean }) => [y.id, y.isCurrent]));
      expect(byId[first.body.id]).toBe(false);
      expect(byId[second.body.id]).toBe(true);
    });

    it('rejects an end date before the start date', async () => {
      const { cookie } = await registerSchool('AY Bad Dates School', 'ay3@example.test');
      const res = await agent()
        .post('/api/v1/academic-years')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ name: 'Backwards', startDate: '2026-04-01', endDate: '2025-04-01' });
      expect(res.status).toBe(400);
    });

    it("404s when School B tries to set-current on School A's academic year", async () => {
      const schoolA = await registerSchool('School A AY', 'schoolA-ay@example.test');
      const schoolB = await registerSchool('School B AY', 'schoolB-ay@example.test');
      const yearA = await agent()
        .post('/api/v1/academic-years')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', schoolA.cookie)
        .send({ name: '2025-26', ...currentYearDates() });

      const res = await agent()
        .post(`/api/v1/academic-years/${yearA.body.id}/set-current`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', schoolB.cookie);
      expect(res.status).toBe(404);
    });
  });
});

// Isolated in its own app instance: registration's ThrottlerGuard keys
// by IP only (correctly — there's no email to key on before an account
// exists), so sharing the app/throttler-storage instance above would let
// earlier registration tests silently consume part of this test's quota,
// making pass/fail depend on run order and test count instead of the
// actual rate-limit behavior.
describe('POST /schools/register rate limiting (isolated app)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const prisma = moduleRef.get(PrismaService);
    const { permissionCatalog } = await import('../prisma/seed-data/permissions');
    for (const permission of permissionCatalog) {
      await prisma.permission.upsert({ where: { key: permission.key }, update: {}, create: permission });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('rate-limits repeated registrations from the same IP', async () => {
    const attempts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/schools/register')
        .set('Origin', WEB_ORIGIN)
        .send({
          schoolName: `Rate Limit School ${i}`,
          directorFirstName: 'D',
          directorLastName: 'R',
          email: `ratelimit${i}@example.test`,
          password: 'correct-horse-battery',
        });
      attempts.push(res.status);
    }
    expect(attempts.slice(0, 5).every((s) => s === 201)).toBe(true);
    expect(attempts[5]).toBe(429);
  });
});
