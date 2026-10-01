import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { resetTestData } from './db-helpers';
import { permissionCatalog } from '../prisma/seed-data/permissions';

// Holidays: who can read vs. change the calendar, validation, the
// "next holiday" the dashboard shows (decided in the school's own time
// zone), and cross-tenant isolation — through the real HTTP stack.

const WEB_ORIGIN = 'http://localhost:3000';

const isoInZone = (timeZone: string, offsetDays = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000),
  );
const kolkata = (offset = 0) => isoInZone('Asia/Kolkata', offset);

describe('Holidays (e2e)', () => {
  let app: INestApplication;
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
  const send = (method: 'post' | 'patch' | 'delete', cookie: string, path: string, body?: object) =>
    agent()[method](`/api/v1${path}`).set('Origin', WEB_ORIGIN).set('Cookie', cookie).send(body);

  async function registerSchool(schoolName: string, email: string) {
    const res = await agent()
      .post('/api/v1/schools/register')
      .set('Origin', WEB_ORIGIN)
      .send({ schoolName, directorFirstName: 'D', directorLastName: 'R', email, password: 'correct-horse-battery' });
    return { schoolId: res.body.schoolId as string, cookie: res.headers['set-cookie'] as unknown as string };
  }

  async function inviteAndLogin(directorCookie: string, roleName: string, email: string) {
    const roles = await agent().get('/api/v1/roles').set('Cookie', directorCookie);
    const role = roles.body.find((r: { name: string }) => r.name === roleName);
    const invite = await send('post', directorCookie, '/memberships/invitations', { email, firstName: 'T', lastName: 'R', roleId: role.id });
    await agent().post('/api/v1/auth/accept-invite').set('Origin', WEB_ORIGIN).send({ token: invite.body.inviteToken, password: 'staff-pass-12345' });
    const login = await agent().post('/api/v1/auth/login').set('Origin', WEB_ORIGIN).send({ email, password: 'staff-pass-12345' });
    const cookie = login.headers['set-cookie'] as unknown as string;
    const me = await agent().get('/api/v1/auth/me').set('Cookie', cookie);
    await send('post', cookie, '/auth/select-school', { membershipId: me.body.memberships[0].membershipId });
    return cookie;
  }

  const diwali = { name: 'Diwali break', type: 'FESTIVAL', startDate: '2030-11-10', endDate: '2030-11-14', description: 'School closed for the festival.' };

  it('lets a Director add, list, edit and delete a holiday', async () => {
    const { cookie } = await registerSchool('Holiday School', 'holiday1@example.test');

    const created = await send('post', cookie, '/holidays', diwali);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Diwali break', type: 'FESTIVAL', startDate: '2030-11-10', endDate: '2030-11-14' });

    const list = await agent().get('/api/v1/holidays').set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const edited = await send('patch', cookie, `/holidays/${created.body.id}`, { name: 'Diwali vacation', endDate: '2030-11-15' });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ name: 'Diwali vacation', startDate: '2030-11-10', endDate: '2030-11-15' });

    const removed = await send('delete', cookie, `/holidays/${created.body.id}`);
    expect(removed.status).toBe(200);
    const after = await agent().get('/api/v1/holidays').set('Cookie', cookie);
    expect(after.body).toHaveLength(0);
  });

  it('keeps dates as plain YYYY-MM-DD, with no time-zone shift', async () => {
    const { cookie } = await registerSchool('Date Shape School', 'holiday2@example.test');
    const created = await send('post', cookie, '/holidays', { name: 'New Year', type: 'OTHER', startDate: '2031-01-01', endDate: '2031-01-01' });
    expect(created.body.startDate).toBe('2031-01-01');
    const list = await agent().get('/api/v1/holidays').set('Cookie', cookie);
    expect(list.body[0].startDate).toBe('2031-01-01');
    expect(list.body[0].endDate).toBe('2031-01-01');
  });

  it('rejects bad input', async () => {
    const { cookie } = await registerSchool('Validation School', 'holiday3@example.test');
    const cases: object[] = [
      { ...diwali, name: '' },
      { ...diwali, name: 'x'.repeat(101) },
      { ...diwali, startDate: 'tomorrow' },
      { ...diwali, startDate: '2030-11-14', endDate: '2030-11-10' }, // ends before it starts
      { ...diwali, type: 'PARTY' },
      { ...diwali, description: 'y'.repeat(501) },
    ];
    for (const body of cases) {
      const res = await send('post', cookie, '/holidays', body);
      expect(res.status).toBe(400);
    }
  });

  it('rejects an edit that would leave the end before the start', async () => {
    const { cookie } = await registerSchool('Range School', 'holiday4@example.test');
    const created = await send('post', cookie, '/holidays', diwali);
    const res = await send('patch', cookie, `/holidays/${created.body.id}`, { endDate: '2030-11-01' });
    expect(res.status).toBe(400);
  });

  it('lets every built-in role view holidays but only managers change them', async () => {
    const { cookie: directorCookie } = await registerSchool('Perm Holiday School', 'holiday5@example.test');
    const created = await send('post', directorCookie, '/holidays', diwali);

    for (const [role, email] of [['Teacher', 't@example.test'], ['Parent', 'p@example.test'], ['Accountant', 'a@example.test']] as const) {
      const cookie = await inviteAndLogin(directorCookie, role, email);
      const list = await agent().get('/api/v1/holidays').set('Cookie', cookie);
      expect(list.status).toBe(200);
      expect(list.body).toHaveLength(1);
      expect((await send('post', cookie, '/holidays', diwali)).status).toBe(403);
      expect((await send('patch', cookie, `/holidays/${created.body.id}`, { name: 'Nope' })).status).toBe(403);
      expect((await send('delete', cookie, `/holidays/${created.body.id}`)).status).toBe(403);
    }
  });

  it('a Principal can manage holidays', async () => {
    const { cookie: directorCookie } = await registerSchool('Principal School', 'holiday6@example.test');
    const principal = await inviteAndLogin(directorCookie, 'Principal', 'principal@example.test');
    const created = await send('post', principal, '/holidays', diwali);
    expect(created.status).toBe(201);
    expect((await send('delete', principal, `/holidays/${created.body.id}`)).status).toBe(200);
    // …but not the things reserved for the Director.
    expect((await send('post', principal, '/roles', { name: 'Sneaky', permissions: [] })).status).toBe(403);
  });

  it('exposes the caller’s permission keys on /auth/me', async () => {
    const { cookie: directorCookie } = await registerSchool('Me Perms School', 'holiday7@example.test');
    const director = await agent().get('/api/v1/auth/me').set('Cookie', directorCookie);
    expect(director.body.permissions).toEqual(expect.arrayContaining(['holiday.create', 'holiday.view', 'role.update']));

    const teacher = await inviteAndLogin(directorCookie, 'Teacher', 'teacher@example.test');
    const me = await agent().get('/api/v1/auth/me').set('Cookie', teacher);
    expect(me.body.permissions).toContain('holiday.view');
    expect(me.body.permissions).not.toContain('holiday.create');
  });

  describe('next holiday', () => {
    it('returns the nearest upcoming holiday with a day count', async () => {
      const { cookie } = await registerSchool('Next School', 'holiday8@example.test');
      await send('post', cookie, '/holidays', { name: 'Long ago', type: 'OTHER', startDate: '2020-01-01', endDate: '2020-01-01' });
      await send('post', cookie, '/holidays', { name: 'Later', type: 'VACATION', startDate: kolkata(30), endDate: kolkata(31) });
      await send('post', cookie, '/holidays', { name: 'Soon', type: 'FESTIVAL', startDate: kolkata(5), endDate: kolkata(5) });

      const res = await agent().get('/api/v1/holidays/next').set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.holiday.name).toBe('Soon');
      expect(res.body.today).toBe(kolkata());
      expect(res.body.daysUntil).toBe(5);
      expect(res.body.ongoing).toBe(false);
    });

    it('treats a holiday that is happening today (or spans today) as ongoing', async () => {
      const { cookie } = await registerSchool('Ongoing School', 'holiday9@example.test');
      await send('post', cookie, '/holidays', { name: 'Winter break', type: 'VACATION', startDate: kolkata(-2), endDate: kolkata(3) });
      const res = await agent().get('/api/v1/holidays/next').set('Cookie', cookie);
      expect(res.body.holiday.name).toBe('Winter break');
      expect(res.body.ongoing).toBe(true);
      expect(res.body.daysUntil).toBe(0);
    });

    it('returns nothing when no holiday is ahead', async () => {
      const { cookie } = await registerSchool('Empty School', 'holiday10@example.test');
      await send('post', cookie, '/holidays', { name: 'Old', type: 'OTHER', startDate: '2020-01-01', endDate: '2020-01-02' });
      const res = await agent().get('/api/v1/holidays/next').set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ today: kolkata(), holiday: null, daysUntil: null, ongoing: false });
    });

    it('measures "today" in the school’s own time zone', async () => {
      const { schoolId, cookie } = await registerSchool('Zone School', 'holiday11@example.test');
      // A zone far from Kolkata, so "today" can differ from the default zone's.
      await send('patch', cookie, '/schools/me', { timezone: 'Pacific/Kiritimati' }); // UTC+14
      await seedClient.school.update({ where: { id: schoolId }, data: { timezone: 'Pacific/Kiritimati' } });
      const kiritimatiToday = isoInZone('Pacific/Kiritimati');
      await send('post', cookie, '/holidays', { name: 'Today there', type: 'OTHER', startDate: kiritimatiToday, endDate: kiritimatiToday });
      const res = await agent().get('/api/v1/holidays/next').set('Cookie', cookie);
      expect(res.body.holiday.name).toBe('Today there');
      expect(res.body.ongoing).toBe(true);
    });
  });

  it('never exposes or changes another school’s holidays', async () => {
    const a = await registerSchool('Tenant A', 'holiday12a@example.test');
    const b = await registerSchool('Tenant B', 'holiday12b@example.test');
    const created = await send('post', a.cookie, '/holidays', diwali);

    const listB = await agent().get('/api/v1/holidays').set('Cookie', b.cookie);
    expect(listB.body).toHaveLength(0);
    expect((await send('patch', b.cookie, `/holidays/${created.body.id}`, { name: 'Hijack' })).status).toBe(404);
    expect((await send('delete', b.cookie, `/holidays/${created.body.id}`)).status).toBe(404);

    const listA = await agent().get('/api/v1/holidays').set('Cookie', a.cookie);
    expect(listA.body[0].name).toBe('Diwali break');
  });

  it('requires a login', async () => {
    const res = await agent().get('/api/v1/holidays');
    expect(res.status).toBe(401);
  });
});
