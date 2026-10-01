import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { resetTestData } from './db-helpers';
import { permissionCatalog } from '../prisma/seed-data/permissions';

// Staff attendance: teachers punch themselves in/out against the school's
// hours, a Principal or Director approves the day — through the real HTTP
// stack. Clock-dependent assertions pick school hours that give the same
// answer whatever time the test runs.

const WEB_ORIGIN = 'http://localhost:3000';
const todayIn = (tz: string, offsetDays = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + offsetDays * 864e5));

describe('Staff attendance (e2e)', () => {
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
  const get = (cookie: string, path: string) => agent().get(`/api/v1${path}`).set('Cookie', cookie);

  async function registerSchool(schoolName: string, email: string) {
    const res = await agent()
      .post('/api/v1/schools/register')
      .set('Origin', WEB_ORIGIN)
      .send({ schoolName, directorFirstName: 'Dee', directorLastName: 'Rector', email, password: 'correct-horse-battery' });
    return { cookie: res.headers['set-cookie'] as unknown as string, schoolId: res.body.schoolId as string };
  }

  async function inviteAndLogin(directorCookie: string, roleName: string, email: string, firstName = roleName) {
    const roles = await get(directorCookie, '/roles');
    const role = roles.body.find((r: { name: string }) => r.name === roleName);
    const invite = await send('post', directorCookie, '/memberships/invitations', { email, firstName, lastName: 'User', roleId: role.id });
    await agent().post('/api/v1/auth/accept-invite').set('Origin', WEB_ORIGIN).send({ token: invite.body.inviteToken, password: 'staff-pass-12345' });
    const login = await agent().post('/api/v1/auth/login').set('Origin', WEB_ORIGIN).send({ email, password: 'staff-pass-12345' });
    const cookie = login.headers['set-cookie'] as unknown as string;
    const me = await get(cookie, '/auth/me');
    await send('post', cookie, '/auth/select-school', { membershipId: me.body.memberships[0].membershipId });
    return { cookie, userId: me.body.id as string };
  }

  async function setup(tag: string) {
    const { cookie: director, schoolId } = await registerSchool(`School ${tag}`, `dir-${tag}@example.test`);
    const principal = await inviteAndLogin(director, 'Principal', `pri-${tag}@example.test`);
    const teacher = await inviteAndLogin(director, 'Teacher', `tea-${tag}@example.test`);
    return { director, principal, teacher, schoolId };
  }

  // School hours that make "late" / "on time" independent of when the test runs.
  const alwaysLate = { staffPunchInTime: '00:00', staffPunchOutTime: '23:59', staffLateGraceMinutes: 0 };
  const neverLate = { staffPunchInTime: '23:00', staffPunchOutTime: '23:59', staffLateGraceMinutes: 120 };

  it('lets a teacher punch in once, recorded as pending approval', async () => {
    const { teacher } = await setup('a');

    const before = await get(teacher.cookie, '/staff-attendance/today');
    expect(before.status).toBe(200);
    expect(before.body.record).toBeNull();
    expect(before.body.schedule).toEqual({ punchIn: '09:00', punchOut: '16:00', graceMinutes: 10 });

    const res = await send('post', teacher.cookie, '/staff-attendance/punch-in');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ approval: 'PENDING', source: 'SELF', punchOutAt: null });
    expect(res.body.date).toBe(todayIn('Asia/Kolkata'));

    const again = await send('post', teacher.cookie, '/staff-attendance/punch-in');
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_PUNCHED_IN');

    const after = await get(teacher.cookie, '/staff-attendance/today');
    expect(after.body.record.id).toBe(res.body.id);
  });

  it('marks a late arrival against the school’s punch-in time and grace period', async () => {
    const { director, teacher } = await setup('b');
    await send('patch', director, '/schools/me', alwaysLate);
    const late = await send('post', teacher.cookie, '/staff-attendance/punch-in');
    expect(late.body.lateMinutes).toBeGreaterThan(0);
  });

  it('does not mark an arrival late inside the grace period', async () => {
    const { director, teacher } = await setup('c');
    await send('patch', director, '/schools/me', neverLate);
    const onTime = await send('post', teacher.cookie, '/staff-attendance/punch-in');
    expect(onTime.body.lateMinutes).toBe(0);
  });

  it('records punch-out, flags leaving early, and refuses a second punch-out or one before punching in', async () => {
    const { director, teacher } = await setup('d');
    await send('patch', director, '/schools/me', alwaysLate); // out time 23:59 → leaving now is early

    const tooSoon = await send('post', teacher.cookie, '/staff-attendance/punch-out');
    expect(tooSoon.status).toBe(400);
    expect(tooSoon.body.error.code).toBe('NOT_PUNCHED_IN');

    await send('post', teacher.cookie, '/staff-attendance/punch-in');
    const out = await send('post', teacher.cookie, '/staff-attendance/punch-out');
    expect(out.status).toBe(200);
    expect(out.body.punchOutAt).not.toBeNull();
    expect(out.body.earlyLeaveMinutes).toBeGreaterThan(0);

    expect((await send('post', teacher.cookie, '/staff-attendance/punch-out')).status).toBe(409);
  });

  it('does not flag leaving early after the punch-out time', async () => {
    const { director, teacher } = await setup('e');
    await send('patch', director, '/schools/me', { staffPunchInTime: '00:00', staffPunchOutTime: '00:01', staffLateGraceMinutes: 0 });
    await send('post', teacher.cookie, '/staff-attendance/punch-in');
    const out = await send('post', teacher.cookie, '/staff-attendance/punch-out');
    expect(out.body.earlyLeaveMinutes).toBe(0);
  });

  it('will not let anyone punch in on a school holiday', async () => {
    const { director, teacher } = await setup('f');
    const today = todayIn('Asia/Kolkata');
    await send('post', director, '/holidays', { name: 'Founders’ Day', type: 'SCHOOL', startDate: today, endDate: today });

    const status = await get(teacher.cookie, '/staff-attendance/today');
    expect(status.body.holiday).toMatchObject({ name: 'Founders’ Day' });
    const res = await send('post', teacher.cookie, '/staff-attendance/punch-in');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('HOLIDAY');
  });

  it('only lets roles with the right permission punch, view the roster, or decide', async () => {
    const { director, teacher } = await setup('g');
    const parent = await inviteAndLogin(director, 'Parent', 'par-g@example.test');
    const receptionist = await inviteAndLogin(director, 'Receptionist', 'rec-g@example.test');

    expect((await send('post', parent.cookie, '/staff-attendance/punch-in')).status).toBe(403);
    expect((await get(parent.cookie, '/staff-attendance/today')).status).toBe(403);
    expect((await send('post', receptionist.cookie, '/staff-attendance/punch-in')).status).toBe(201); // office staff punch too

    for (const path of ['/staff-attendance/roster', '/staff-attendance/pending']) {
      expect((await get(teacher.cookie, path)).status).toBe(403);
    }
    expect((await send('post', teacher.cookie, '/staff-attendance/approve-all', { date: todayIn('Asia/Kolkata') })).status).toBe(403);
    expect((await send('post', teacher.cookie, '/staff-attendance/some-id/approve', {})).status).toBe(403);
  });

  it('shows a Principal who is in, who is late and who has not marked, then lets them approve', async () => {
    const { director, principal, teacher } = await setup('h');
    await send('patch', director, '/schools/me', alwaysLate);
    const other = await inviteAndLogin(director, 'Teacher', 'tea2-h@example.test', 'Other');
    const record = await send('post', teacher.cookie, '/staff-attendance/punch-in');

    const roster = await get(principal.cookie, '/staff-attendance/roster');
    expect(roster.status).toBe(200);
    const names = roster.body.rows.map((r: { roleName: string }) => r.roleName);
    expect(names).toEqual(expect.arrayContaining(['Teacher', 'Principal', 'Director']));
    expect(roster.body.summary).toMatchObject({ present: 1, late: 1, pendingApproval: 1 });
    expect(roster.body.summary.notMarked).toBe(roster.body.summary.expected - 1);
    const mine = roster.body.rows.find((r: { userId: string }) => r.userId === teacher.userId);
    expect(mine.record.id).toBe(record.body.id);
    expect(roster.body.rows.find((r: { userId: string }) => r.userId === other.userId).record).toBeNull();

    const pending = await get(principal.cookie, '/staff-attendance/pending');
    expect(pending.body).toMatchObject({ count: 1, people: 1, oldestDate: todayIn('Asia/Kolkata') });

    const approved = await send('post', principal.cookie, `/staff-attendance/${record.body.id}/approve`, { note: 'Thanks' });
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ approval: 'APPROVED', decisionNote: 'Thanks' });
    expect((await get(principal.cookie, '/staff-attendance/pending')).body.count).toBe(0);

    // The teacher is told.
    const notes = await get(teacher.cookie, '/notifications');
    expect(notes.body[0]).toMatchObject({ title: expect.stringContaining('approved'), link: '/dashboard/my-attendance' });

    // …and a decided day can't be decided again.
    expect((await send('post', principal.cookie, `/staff-attendance/${record.body.id}/reject`, { note: 'changed my mind' })).status).toBe(400);
  });

  it('rejects with a reason, tells the teacher, and stops them changing that day', async () => {
    const { principal, teacher } = await setup('i');
    const record = await send('post', teacher.cookie, '/staff-attendance/punch-in');

    expect((await send('post', principal.cookie, `/staff-attendance/${record.body.id}/reject`, {})).status).toBe(400);
    const rejected = await send('post', principal.cookie, `/staff-attendance/${record.body.id}/reject`, { note: 'You were on leave.' });
    expect(rejected.body).toMatchObject({ approval: 'REJECTED', decisionNote: 'You were on leave.' });
    expect((await get(teacher.cookie, '/notifications')).body[0].body).toBe('You were on leave.');

    const out = await send('post', teacher.cookie, '/staff-attendance/punch-out');
    expect(out.status).toBe(400);
    expect(out.body.error.code).toBe('REJECTED');
  });

  it('auto-approves the day of someone who can approve, and never lets anyone decide their own', async () => {
    const { director, principal } = await setup('j');
    const own = await send('post', principal.cookie, '/staff-attendance/punch-in');
    expect(own.body).toMatchObject({ approval: 'APPROVED', decisionNote: 'Auto-approved' });

    // A pending row of one's own (e.g. permissions changed later) still can't be self-decided.
    const teacherLikeRow = await seedClient.staffAttendance.create({
      data: { schoolId: (await seedClient.school.findFirstOrThrow()).id, userId: (await get(director, '/auth/me')).body.id, date: new Date('2020-01-02'), punchInAt: new Date('2020-01-02T04:00:00Z') },
    });
    const res = await send('post', director, `/staff-attendance/${teacherLikeRow.id}/approve`, {});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OWN_RECORD');
  });

  it('approves everyone waiting for a date at once, but not the approver’s own', async () => {
    const { director, principal, teacher } = await setup('k');
    const second = await inviteAndLogin(director, 'Teacher', 'tea2-k@example.test');
    await send('post', teacher.cookie, '/staff-attendance/punch-in');
    await send('post', second.cookie, '/staff-attendance/punch-in');

    const today = todayIn('Asia/Kolkata');
    expect((await send('post', principal.cookie, '/staff-attendance/approve-all', { date: 'soon' })).status).toBe(400);
    const res = await send('post', principal.cookie, '/staff-attendance/approve-all', { date: today });
    expect(res.body).toEqual({ approved: 2 });
    expect((await get(principal.cookie, '/staff-attendance/pending')).body.count).toBe(0);
    expect((await send('post', principal.cookie, '/staff-attendance/approve-all', { date: today })).body).toEqual({ approved: 0 });
  });

  it('lists a person’s own month with totals, and only their own', async () => {
    const { director, teacher } = await setup('l');
    await send('patch', director, '/schools/me', alwaysLate);
    const other = await inviteAndLogin(director, 'Teacher', 'tea2-l@example.test');
    await send('post', teacher.cookie, '/staff-attendance/punch-in');
    await send('post', other.cookie, '/staff-attendance/punch-in');

    const mine = await get(teacher.cookie, '/staff-attendance/mine');
    expect(mine.status).toBe(200);
    expect(mine.body.month).toBe(todayIn('Asia/Kolkata').slice(0, 7));
    expect(mine.body.records).toHaveLength(1);
    expect(mine.body.summary).toMatchObject({ daysPresent: 1, daysLate: 1, pendingApproval: 1 });
    expect((await get(teacher.cookie, '/staff-attendance/mine?month=2019-01')).body.records).toHaveLength(0);
  });

  it('refuses a roster for a future or malformed date', async () => {
    const { principal } = await setup('m');
    expect((await get(principal.cookie, `/staff-attendance/roster?date=${todayIn('Asia/Kolkata', 3)}`)).status).toBe(400);
    expect((await get(principal.cookie, '/staff-attendance/roster?date=yesterday')).status).toBe(400);
    expect((await get(principal.cookie, `/staff-attendance/roster?date=${todayIn('Asia/Kolkata', -1)}`)).status).toBe(200);
  });

  it('keeps one school’s attendance away from another', async () => {
    const a = await setup('n');
    const b = await setup('o');
    const record = await send('post', a.teacher.cookie, '/staff-attendance/punch-in');

    expect((await send('post', b.principal.cookie, `/staff-attendance/${record.body.id}/approve`, {})).status).toBe(404);
    expect((await send('post', b.principal.cookie, `/staff-attendance/${record.body.id}/reject`, { note: 'not yours' })).status).toBe(404);
    const roster = await get(b.principal.cookie, '/staff-attendance/roster');
    expect(roster.body.rows.every((r: { record: unknown }) => r.record === null)).toBe(true);
    expect((await send('post', b.principal.cookie, '/staff-attendance/approve-all', { date: todayIn('Asia/Kolkata') })).body).toEqual({ approved: 0 });
    expect((await get(a.principal.cookie, '/staff-attendance/pending')).body.count).toBe(1); // untouched
  });
});
