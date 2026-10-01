import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { resetTestData } from './db-helpers';
import { permissionCatalog } from '../prisma/seed-data/permissions';
import { currentYearDates, nextYearDates, pastYearDates } from './year-helpers';

// Academic years: the Principal-proposes / Director-decides workflow,
// automatic expiry, and who gets told what — through the real HTTP stack.

const WEB_ORIGIN = 'http://localhost:3000';

describe('Academic years (e2e)', () => {
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

  async function inviteAndLogin(directorCookie: string, roleName: string, email: string) {
    const roles = await get(directorCookie, '/roles');
    const role = roles.body.find((r: { name: string }) => r.name === roleName);
    const invite = await send('post', directorCookie, '/memberships/invitations', { email, firstName: roleName, lastName: 'User', roleId: role.id });
    await agent().post('/api/v1/auth/accept-invite').set('Origin', WEB_ORIGIN).send({ token: invite.body.inviteToken, password: 'staff-pass-12345' });
    const login = await agent().post('/api/v1/auth/login').set('Origin', WEB_ORIGIN).send({ email, password: 'staff-pass-12345' });
    const cookie = login.headers['set-cookie'] as unknown as string;
    const me = await get(cookie, '/auth/me');
    await send('post', cookie, '/auth/select-school', { membershipId: me.body.memberships[0].membershipId });
    return cookie;
  }

  // A school with a Director, a Principal, and an approved current year already in place.
  async function setup(tag: string) {
    const { cookie: director, schoolId } = await registerSchool(`School ${tag}`, `dir-${tag}@example.test`);
    const principal = await inviteAndLogin(director, 'Principal', `pri-${tag}@example.test`);
    return { director, principal, schoolId };
  }

  const nextYear = { name: '2027-28', ...nextYearDates() };

  it('approves a year straight away when a Director creates it, and makes the first one current', async () => {
    const { director } = await setup('a');
    const res = await send('post', director, '/academic-years', { name: '2026-27', ...currentYearDates() });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'APPROVED', isCurrent: true });
    const second = await send('post', director, '/academic-years', nextYear);
    expect(second.body).toMatchObject({ status: 'APPROVED', isCurrent: false });
  });

  it('holds a Principal’s year as PENDING_APPROVAL, unusable and not current, and tells the Director', async () => {
    const { director, principal } = await setup('b');
    const res = await send('post', principal, '/academic-years', nextYear);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'PENDING_APPROVAL', isCurrent: false });
    expect(res.body.createdBy.name).toContain('Principal');

    // The Director is told, in the app, with a link to decide.
    const notes = await get(director, '/notifications');
    expect(notes.body).toHaveLength(1);
    expect(notes.body[0]).toMatchObject({ title: expect.stringContaining('2027-28'), link: '/dashboard/academic-years', readAt: null });
    // …the Principal who proposed it is not.
    expect((await get(principal, '/notifications')).body).toHaveLength(0);

    // It can't be used for classes until approved.
    const cls = await send('post', principal, '/classes', { academicYearId: res.body.id, name: 'Grade 1', order: 1 });
    expect(cls.status).toBe(400);
    expect(cls.body.error.code).toBe('ACADEMIC_YEAR_NOT_APPROVED');
    const setCurrent = await send('post', director, `/academic-years/${res.body.id}/set-current`);
    expect(setCurrent.status).toBe(400);
  });

  it('shows the Director what is waiting, and the Principal what was sent back', async () => {
    const { director, principal } = await setup('c');
    const year = await send('post', principal, '/academic-years', nextYear);
    const forDirector = await get(director, '/academic-years/attention');
    expect(forDirector.body.awaitingApproval.map((y: { id: string }) => y.id)).toEqual([year.body.id]);
    expect((await get(principal, '/academic-years/attention')).body.awaitingApproval).toHaveLength(0);

    await send('post', director, `/academic-years/${year.body.id}/request-changes`, { note: 'Move the start to 1 April.' });
    const forPrincipal = await get(principal, '/academic-years/attention');
    expect(forPrincipal.body.needsRevision.map((y: { id: string }) => y.id)).toEqual([year.body.id]);
    expect((await get(director, '/academic-years/attention')).body.awaitingApproval).toHaveLength(0);
  });

  it('lets only the Director decide', async () => {
    const { director, principal } = await setup('d');
    const year = await send('post', principal, '/academic-years', nextYear);
    for (const path of ['approve', 'reject', 'request-changes']) {
      const res = await send('post', principal, `/academic-years/${year.body.id}/${path}`, { note: 'I approve myself' });
      expect(res.status).toBe(403);
    }
    const teacher = await inviteAndLogin(director, 'Teacher', 'teacher-d@example.test');
    expect((await send('post', teacher, '/academic-years', nextYear)).status).toBe(403);
    expect((await send('post', teacher, `/academic-years/${year.body.id}/approve`, {})).status).toBe(403);
  });

  it('approves: the year becomes usable, the Principal is told, and the history records it', async () => {
    const { director, principal } = await setup('e');
    await send('post', director, '/academic-years', { name: '2026-27', ...currentYearDates() });
    const year = await send('post', principal, '/academic-years', nextYear);

    const approved = await send('post', director, `/academic-years/${year.body.id}/approve`, { note: 'Looks right.' });
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ status: 'APPROVED', isCurrent: false, decisionNote: 'Looks right.' });
    expect(approved.body.decidedBy.name).toContain('Dee');

    const notes = await get(principal, '/notifications');
    expect(notes.body[0].title).toContain('approved');
    expect(notes.body[0].body).toContain('Looks right.');

    const cls = await send('post', principal, '/classes', { academicYearId: year.body.id, name: 'Grade 1', order: 1 });
    expect(cls.status).toBe(201);

    const history = await get(director, `/academic-years/${year.body.id}/reviews`);
    expect(history.body.map((r: { action: string }) => r.action)).toEqual(['SUBMITTED', 'APPROVED']);
    expect(history.body[1].note).toBe('Looks right.');

    // A decided year can't be decided again.
    expect((await send('post', director, `/academic-years/${year.body.id}/reject`, { note: 'Changed my mind' })).status).toBe(400);
  });

  it('rejects with a reason, tells the Principal, and asks for a new name on the next attempt', async () => {
    const { director, principal } = await setup('f');
    const year = await send('post', principal, '/academic-years', nextYear);

    expect((await send('post', director, `/academic-years/${year.body.id}/reject`, {})).status).toBe(400); // a reason is required
    expect((await send('post', director, `/academic-years/${year.body.id}/reject`, { note: 'no' })).status).toBe(400); // too short

    const rejected = await send('post', director, `/academic-years/${year.body.id}/reject`, { note: 'Dates clash with the board exams.' });
    expect(rejected.body).toMatchObject({ status: 'REJECTED', decisionNote: 'Dates clash with the board exams.' });
    const notes = await get(principal, '/notifications');
    expect(notes.body[0].title).toContain('rejected');

    // A rejected year is closed — can't be edited or resubmitted…
    expect((await send('patch', principal, `/academic-years/${year.body.id}`, { name: '2027-28 (v2)' })).status).toBe(400);
    expect((await send('post', principal, `/academic-years/${year.body.id}/resubmit`, {})).status).toBe(400);
    // …and a new attempt needs its own name (the rejected one stays on record)…
    const same = await send('post', principal, '/academic-years', nextYear);
    expect(same.status).toBe(400);
    expect(same.body.error.message).toContain('rejected earlier');
    // …after which it goes through.
    expect((await send('post', principal, '/academic-years', { ...nextYear, name: '2027-28 (revised)' })).status).toBe(201);
  });

  it('sends suggestions back; the Principal edits, resubmits, and the Director approves', async () => {
    const { director, principal } = await setup('g');
    const year = await send('post', principal, '/academic-years', nextYear);

    const back = await send('post', director, `/academic-years/${year.body.id}/request-changes`, { note: 'Please end it on 31 March.' });
    expect(back.body.status).toBe('CHANGES_REQUESTED');
    expect((await get(principal, '/notifications')).body[0].body).toContain('Please end it on 31 March.');

    // Not yet pending again, so the Director can't approve it as-is.
    expect((await send('post', director, `/academic-years/${year.body.id}/approve`, {})).status).toBe(400);

    const edited = await send('patch', principal, `/academic-years/${year.body.id}`, { name: '2027-28 revised' });
    expect(edited.status).toBe(200);
    expect(edited.body.name).toBe('2027-28 revised');

    const resubmitted = await send('post', principal, `/academic-years/${year.body.id}/resubmit`, { note: 'Fixed the end date.' });
    expect(resubmitted.body).toMatchObject({ status: 'PENDING_APPROVAL', decisionNote: null });
    expect((await get(director, '/notifications')).body.some((n: { title: string }) => n.title.includes('resubmitted'))).toBe(true);

    expect((await send('post', director, `/academic-years/${year.body.id}/approve`, {})).body.status).toBe('APPROVED');
    const history = await get(director, `/academic-years/${year.body.id}/reviews`);
    expect(history.body.map((r: { action: string }) => r.action)).toEqual(['SUBMITTED', 'CHANGES_REQUESTED', 'RESUBMITTED', 'APPROVED']);
  });

  it('locks an approved year against editing', async () => {
    const { director } = await setup('h');
    const year = await send('post', director, '/academic-years', { name: '2026-27', ...currentYearDates() });
    expect((await send('patch', director, `/academic-years/${year.body.id}`, { name: 'Renamed' })).status).toBe(400);
  });

  it('rejects dates that have already ended, overlap another year, or run backwards', async () => {
    const { director } = await setup('i');
    await send('post', director, '/academic-years', { name: '2026-27', ...currentYearDates() });

    const past = await send('post', director, '/academic-years', { name: 'Old', ...pastYearDates() });
    expect(past.status).toBe(400);
    expect(past.body.error.message).toContain('already ended');

    const overlap = await send('post', director, '/academic-years', { name: 'Overlapping', ...currentYearDates() });
    expect(overlap.status).toBe(400);
    expect(overlap.body.error.message).toContain('overlap');

    expect((await send('post', director, '/academic-years', { name: 'Backwards', startDate: '2030-04-01', endDate: '2029-04-01' })).status).toBe(400);
    expect((await send('post', director, '/academic-years', { name: 'Bad date', startDate: 'soon', endDate: '2031-03-31' })).status).toBe(400);
    expect((await send('post', director, '/academic-years', { name: '2026-27', ...nextYearDates() })).status).toBe(400); // duplicate name
  });

  describe('automatic expiry', () => {
    // Inserts a year the way the app would have stored it, bypassing the "no past dates" rule.
    const insertYear = (schoolId: string, name: string, dates: { startDate: string; endDate: string }, extra: object = {}) =>
      seedClient.academicYear.create({
        data: { schoolId, name, startDate: new Date(dates.startDate), endDate: new Date(dates.endDate), status: 'APPROVED', ...extra },
      });

    it('expires a year once its end date passes, drops its "current" flag and hands over to the year that covers today', async () => {
      const { director, schoolId } = await setup('j');
      const old = await insertYear(schoolId, '2024-25', pastYearDates(), { isCurrent: true });
      const live = await insertYear(schoolId, '2026-27', currentYearDates());

      const list = await get(director, '/academic-years');
      const byName = Object.fromEntries(list.body.map((y: { name: string }) => [y.name, y]));
      expect(byName['2024-25']).toMatchObject({ status: 'EXPIRED', isCurrent: false });
      expect(byName['2026-27']).toMatchObject({ status: 'APPROVED', isCurrent: true });

      const history = await get(director, `/academic-years/${old.id}/reviews`);
      expect(history.body.map((r: { action: string }) => r.action)).toContain('EXPIRED');
      expect(live.id).toBeTruthy();
    });

    it('leaves no current year when nothing covers today, and does not re-expire on every read', async () => {
      const { director, schoolId } = await setup('k');
      await insertYear(schoolId, '2024-25', pastYearDates(), { isCurrent: true });
      await get(director, '/academic-years');
      const again = await get(director, '/academic-years');
      expect(again.body.find((y: { isCurrent: boolean }) => y.isCurrent)).toBeUndefined();
      const rows = await seedClient.academicYearReview.count({ where: { schoolId, action: 'EXPIRED' } });
      expect(rows).toBe(1);
    });

    it('makes an expired year read-only: no new classes or fees, and it can’t be made current', async () => {
      const { director, schoolId } = await setup('l');
      const old = await insertYear(schoolId, '2024-25', pastYearDates());

      const cls = await send('post', director, '/classes', { academicYearId: old.id, name: 'Grade 1', order: 1 });
      expect(cls.status).toBe(400);
      expect(cls.body.error.code).toBe('ACADEMIC_YEAR_EXPIRED');

      const category = await send('post', director, '/fee-categories', { name: 'Tuition' });
      const fee = await send('post', director, '/fee-structures', { feeCategoryId: category.body.id, academicYearId: old.id, amountMinor: 100000, frequency: 'MONTHLY' });
      expect(fee.status).toBe(400);
      expect(fee.body.error.code).toBe('ACADEMIC_YEAR_EXPIRED');

      const setCurrent = await send('post', director, `/academic-years/${old.id}/set-current`);
      expect(setCurrent.status).toBe(400);
    });

    it('expires a proposal nobody decided in time, so it can no longer be approved', async () => {
      const { director, schoolId } = await setup('m');
      const stale = await insertYear(schoolId, '2024-25', pastYearDates(), { status: 'PENDING_APPROVAL' });
      const res = await send('post', director, `/academic-years/${stale.id}/approve`, {});
      expect(res.status).toBe(400);
      const list = await get(director, '/academic-years');
      expect(list.body.find((y: { id: string }) => y.id === stale.id).status).toBe('EXPIRED');
    });

    it('expires a year the moment its end date passes in the school’s own time zone', async () => {
      const { director, schoolId } = await setup('n');
      // Yesterday in Auckland is still "today" in Honolulu — the same row must read differently per school zone.
      const dayMs = 24 * 60 * 60 * 1000;
      const iso = (offset: number, tz: string) =>
        new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + offset * dayMs));
      const endsYesterdayInAuckland = iso(-1, 'Pacific/Auckland');
      await seedClient.school.update({ where: { id: schoolId }, data: { timezone: 'Pacific/Auckland' } });
      await insertYear(schoolId, 'Zone year', { startDate: '2020-01-01', endDate: endsYesterdayInAuckland }, { isCurrent: true });
      const list = await get(director, '/academic-years');
      expect(list.body.find((y: { name: string }) => y.name === 'Zone year').status).toBe('EXPIRED');
    });
  });

  it('404s decisions on another school’s year', async () => {
    const a = await setup('o');
    const b = await setup('p');
    const year = await send('post', a.principal, '/academic-years', nextYear);
    for (const path of ['approve', 'reject', 'request-changes']) {
      expect((await send('post', b.director, `/academic-years/${year.body.id}/${path}`, { note: 'not yours' })).status).toBe(404);
    }
    expect((await get(b.director, `/academic-years/${year.body.id}/reviews`)).status).toBe(404);
  });

  describe('notifications', () => {
    it('lists only your own, marks one or all as read, and 404s someone else’s', async () => {
      const { director, principal } = await setup('q');
      await send('post', principal, '/academic-years', nextYear);
      await send('post', principal, '/academic-years', { name: '2028-29', startDate: '2029-04-01', endDate: '2030-03-31' });

      const mine = await get(director, '/notifications');
      expect(mine.body).toHaveLength(2);
      expect(await get(principal, '/notifications').then((r) => r.body)).toHaveLength(0);

      const one = mine.body[0].id as string;
      expect((await send('post', principal, `/notifications/${one}/read`)).status).toBe(404);
      expect((await send('post', director, `/notifications/${one}/read`)).status).toBe(200);
      expect((await get(director, '/notifications')).body.filter((n: { readAt: string | null }) => !n.readAt)).toHaveLength(1);

      expect((await send('post', director, '/notifications/read-all')).body.updated).toBe(1);
      expect((await get(director, '/notifications')).body.every((n: { readAt: string | null }) => !!n.readAt)).toBe(true);
    });
  });
});
