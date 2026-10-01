import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { resetTestData } from './db-helpers';
import { permissionCatalog } from '../prisma/seed-data/permissions';
import { currentYearDates } from './year-helpers';

// When a student is marked absent today, their parents are told — in the
// app and by email — once each; corrections are sent too; and what
// happened is visible to staff. Through the real HTTP stack.

const WEB_ORIGIN = 'http://localhost:3000';
const todayIso = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

describe('Absence alerts to parents (e2e)', () => {
  let app: INestApplication;
  const seedClient = new PrismaClient();
  const send = jest.fn();
  let emailConfigured = true;

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
    send.mockReset().mockResolvedValue(true);
    emailConfigured = true;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({
        send,
        get isConfigured() {
          return emailConfigured;
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
    await app.close();
  });

  const agent = () => request(app.getHttpServer());
  const post = (cookie: string, path: string, body?: object) => agent().post(`/api/v1${path}`).set('Origin', WEB_ORIGIN).set('Cookie', cookie).send(body);
  const patch = (cookie: string, path: string, body?: object) => agent().patch(`/api/v1${path}`).set('Origin', WEB_ORIGIN).set('Cookie', cookie).send(body);
  const get = (cookie: string, path: string) => agent().get(`/api/v1${path}`).set('Cookie', cookie);

  async function setup(tag: string) {
    const reg = await agent()
      .post('/api/v1/schools/register')
      .set('Origin', WEB_ORIGIN)
      .send({ schoolName: `Alert School ${tag}`, directorFirstName: 'Dee', directorLastName: 'Rector', email: `dir-${tag}@example.test`, password: 'correct-horse-battery' });
    const cookie = reg.headers['set-cookie'] as unknown as string;
    const year = await post(cookie, '/academic-years', { name: '2026-27', ...currentYearDates() });
    const klass = await post(cookie, '/classes', { academicYearId: year.body.id, name: 'Grade 5', order: 5 });
    const section = await post(cookie, `/classes/${klass.body.id}/sections`, { name: 'A' });
    return { cookie, sectionId: section.body.id as string, schoolId: reg.body.schoolId as string };
  }

  async function addStudent(cookie: string, sectionId: string, n: number, first = `Kid${n}`) {
    const res = await post(cookie, '/students', { admissionNo: `AB-${n}`, firstName: first, lastName: 'Rao', sectionId });
    return res.body.id as string;
  }

  async function addParent(cookie: string, studentId: string, opts: { email?: string; portal?: boolean; name?: string }) {
    const parent = await post(cookie, '/parents', { firstName: opts.name ?? 'Meera', lastName: 'Singh', ...(opts.email ? { email: opts.email } : {}) });
    await post(cookie, `/students/${studentId}/parents`, { parentId: parent.body.id, relation: 'Mother' });
    let parentCookie: string | null = null;
    if (opts.portal) {
      const portalEmail = opts.email ?? `portal-${parent.body.id}@example.test`;
      const invite = await post(cookie, `/parents/${parent.body.id}/invite`, { email: portalEmail });
      await agent().post('/api/v1/auth/accept-invite').set('Origin', WEB_ORIGIN).send({ token: invite.body.inviteToken, password: 'parent-pass-123' });
      const login = await agent().post('/api/v1/auth/login').set('Origin', WEB_ORIGIN).send({ email: portalEmail, password: 'parent-pass-123' });
      parentCookie = login.headers['set-cookie'] as unknown as string;
      const me = await get(parentCookie, '/auth/me');
      await post(parentCookie, '/auth/select-school', { membershipId: me.body.memberships[0].membershipId });
    }
    return { parentId: parent.body.id as string, parentCookie };
  }

  // The portal-invite emails also go through the mocked sender; only count the alerts.
  const alertMails = () => send.mock.calls.map((c) => c[0] as { to: string; subject: string; html: string }).filter((m) => /absent|not absent/i.test(m.subject));

  const mark = (cookie: string, sectionId: string, records: { studentId: string; status: string }[]) =>
    post(cookie, '/attendance', { sectionId, date: todayIso(), records });

  it('tells a parent with a portal account in the app and by email when their child is absent', async () => {
    const { cookie, sectionId } = await setup('a');
    const studentId = await addStudent(cookie, sectionId, 1, 'Riya');
    const { parentCookie } = await addParent(cookie, studentId, { email: 'meera@example.test', portal: true });

    const res = await mark(cookie, sectionId, [{ studentId, status: 'ABSENT' }]);
    expect(res.status).toBe(201);

    const notes = await get(parentCookie as string, '/notifications');
    expect(notes.body).toHaveLength(1);
    expect(notes.body[0]).toMatchObject({ title: 'Riya was marked absent today', link: '/dashboard/my-children', readAt: null });
    expect(notes.body[0].body).toContain('Riya Rao (Grade 5 – A)');

    expect(alertMails()).toHaveLength(1);
    const mail = alertMails()[0];
    expect(mail.to).toBe('meera@example.test');
    expect(mail.subject).toContain('Riya was marked absent today');
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.html).toContain('Dear Meera');

    const alerts = await get(cookie, `/attendance/absence-alerts?sectionId=${sectionId}&date=${todayIso()}`);
    expect(alerts.status).toBe(200);
    expect(alerts.body[0]).toMatchObject({ studentId, parentCount: 1, parentsReached: 1 });
    expect(alerts.body[0].attempts.map((a: { channel: string; status: string }) => `${a.channel}:${a.status}`).sort()).toEqual(['EMAIL:SENT', 'IN_APP:SENT']);
  });

  it('does not message for present, late or excused students', async () => {
    const { cookie, sectionId } = await setup('b');
    const ids = [await addStudent(cookie, sectionId, 1), await addStudent(cookie, sectionId, 2), await addStudent(cookie, sectionId, 3)];
    for (const id of ids) await addParent(cookie, id, { email: `p-${id}@example.test`, portal: true });

    await mark(cookie, sectionId, [
      { studentId: ids[0], status: 'PRESENT' },
      { studentId: ids[1], status: 'LATE' },
      { studentId: ids[2], status: 'EXCUSED' },
    ]);
    expect(alertMails()).toHaveLength(0);
    expect(await seedClient.absenceAlert.count()).toBe(0);
  });

  it('records who could not be reached: no portal account, no email, or email not set up', async () => {
    const { cookie, sectionId } = await setup('c');
    const studentId = await addStudent(cookie, sectionId, 1);
    await addParent(cookie, studentId, { name: 'NoContact' }); // no email, no account
    await addParent(cookie, studentId, { name: 'EmailOnly', email: 'emailonly@example.test' });

    await mark(cookie, sectionId, [{ studentId, status: 'ABSENT' }]);
    expect(alertMails()).toHaveLength(1); // only the parent with an address

    const alerts = await get(cookie, `/attendance/absence-alerts?sectionId=${sectionId}&date=${todayIso()}`);
    expect(alerts.body[0]).toMatchObject({ parentCount: 2, parentsReached: 1 });
    const detail = (name: string, channel: string) =>
      alerts.body[0].attempts.find((a: { parent: string; channel: string }) => a.parent.startsWith(name) && a.channel === channel);
    expect(detail('NoContact', 'EMAIL')).toMatchObject({ status: 'SKIPPED', detail: 'No email address on file' });
    expect(detail('NoContact', 'IN_APP')).toMatchObject({ status: 'SKIPPED', detail: 'No portal account yet' });
    expect(detail('EmailOnly', 'EMAIL')).toMatchObject({ status: 'SENT' });
    expect(detail('EmailOnly', 'IN_APP')).toMatchObject({ status: 'SKIPPED' });
  });

  it('notes when email is not set up, and when the provider fails', async () => {
    const { cookie, sectionId } = await setup('d');
    const s1 = await addStudent(cookie, sectionId, 1);
    const s2 = await addStudent(cookie, sectionId, 2);
    await addParent(cookie, s1, { email: 'one@example.test' });
    await addParent(cookie, s2, { email: 'two@example.test' });

    emailConfigured = false;
    await mark(cookie, sectionId, [{ studentId: s1, status: 'ABSENT' }]);
    emailConfigured = true;
    send.mockResolvedValue(false);
    await mark(cookie, sectionId, [{ studentId: s2, status: 'ABSENT' }]);

    const alerts = await get(cookie, `/attendance/absence-alerts?sectionId=${sectionId}&date=${todayIso()}`);
    const email = (id: string) => alerts.body.find((a: { studentId: string }) => a.studentId === id).attempts.find((x: { channel: string }) => x.channel === 'EMAIL');
    expect(email(s1)).toMatchObject({ status: 'SKIPPED', detail: expect.stringContaining('isn’t set up') });
    expect(email(s2)).toMatchObject({ status: 'FAILED' });
  });

  it('tells every linked parent, and never twice when attendance is saved again', async () => {
    const { cookie, sectionId } = await setup('e');
    const studentId = await addStudent(cookie, sectionId, 1);
    const mum = await addParent(cookie, studentId, { email: 'mum@example.test', portal: true, name: 'Mum' });
    const dad = await addParent(cookie, studentId, { email: 'dad@example.test', portal: true, name: 'Dad' });

    await mark(cookie, sectionId, [{ studentId, status: 'ABSENT' }]);
    await mark(cookie, sectionId, [{ studentId, status: 'ABSENT' }]);
    await Promise.all([mark(cookie, sectionId, [{ studentId, status: 'ABSENT' }]), mark(cookie, sectionId, [{ studentId, status: 'ABSENT' }])]);

    expect((await get(mum.parentCookie as string, '/notifications')).body).toHaveLength(1);
    expect((await get(dad.parentCookie as string, '/notifications')).body).toHaveLength(1);
    expect(alertMails()).toHaveLength(2);
  });

  it('sends a correction once if an absence was a mistake', async () => {
    const { cookie, sectionId } = await setup('f');
    const studentId = await addStudent(cookie, sectionId, 1, 'Riya');
    const { parentCookie } = await addParent(cookie, studentId, { email: 'meera@example.test', portal: true });

    await mark(cookie, sectionId, [{ studentId, status: 'ABSENT' }]);
    await mark(cookie, sectionId, [{ studentId, status: 'PRESENT' }]);
    await mark(cookie, sectionId, [{ studentId, status: 'PRESENT' }]);

    const notes = (await get(parentCookie as string, '/notifications')).body as { title: string }[];
    expect(notes.map((n) => n.title).sort()).toEqual(['Riya was marked absent today', 'Update: Riya is not absent today']);
    expect(alertMails()).toHaveLength(2);

    // Marked absent again later the same day: the parent hears about it again.
    await mark(cookie, sectionId, [{ studentId, status: 'ABSENT' }]);
    const after = (await get(parentCookie as string, '/notifications')).body as { title: string }[];
    expect(after.filter((n) => n.title === 'Riya was marked absent today')).toHaveLength(2);
  });

  it('also handles the single-record correction route', async () => {
    const { cookie, sectionId } = await setup('g');
    const studentId = await addStudent(cookie, sectionId, 1, 'Riya');
    const { parentCookie } = await addParent(cookie, studentId, { portal: true });
    await mark(cookie, sectionId, [{ studentId, status: 'PRESENT' }]);
    const roster = await get(cookie, `/attendance?sectionId=${sectionId}&date=${todayIso()}`);
    const attendanceId = roster.body[0].attendanceId;

    await patch(cookie, `/attendance/${attendanceId}`, { status: 'ABSENT' });
    expect((await get(parentCookie as string, '/notifications')).body).toHaveLength(1);
    await patch(cookie, `/attendance/${attendanceId}`, { status: 'PRESENT' });
    expect((await get(parentCookie as string, '/notifications')).body).toHaveLength(2);
  });

  it('can be switched off in school settings', async () => {
    const { cookie, sectionId } = await setup('h');
    const studentId = await addStudent(cookie, sectionId, 1);
    const { parentCookie } = await addParent(cookie, studentId, { email: 'meera@example.test', portal: true });

    const off = await patch(cookie, '/schools/me', { notifyParentsOnAbsence: false });
    expect(off.body.notifyParentsOnAbsence).toBe(false);
    await mark(cookie, sectionId, [{ studentId, status: 'ABSENT' }]);
    expect((await get(parentCookie as string, '/notifications')).body).toHaveLength(0);
    expect(alertMails()).toHaveLength(0);
  });

  it('handles a student with no parent linked, and still saves attendance', async () => {
    const { cookie, sectionId } = await setup('i');
    const studentId = await addStudent(cookie, sectionId, 1);
    const res = await mark(cookie, sectionId, [{ studentId, status: 'ABSENT' }]);
    expect(res.status).toBe(201);
    expect(res.body[0].status).toBe('ABSENT');
    const alerts = await get(cookie, `/attendance/absence-alerts?sectionId=${sectionId}&date=${todayIso()}`);
    expect(alerts.body[0]).toMatchObject({ parentCount: 0, parentsReached: 0, attempts: [] });
  });

  it('keeps attendance saved even if sending blows up', async () => {
    const { cookie, sectionId } = await setup('j');
    const studentId = await addStudent(cookie, sectionId, 1);
    await addParent(cookie, studentId, { email: 'meera@example.test' });
    send.mockRejectedValue(new Error('smtp exploded'));
    const res = await mark(cookie, sectionId, [{ studentId, status: 'ABSENT' }]);
    expect(res.status).toBe(201);
    expect((await get(cookie, `/attendance?sectionId=${sectionId}&date=${todayIso()}`)).body[0].status).toBe('ABSENT');
  });

  it('keeps other schools out of the alerts endpoint, and other parents out of the notifications', async () => {
    const a = await setup('k');
    const b = await setup('l');
    const studentId = await addStudent(a.cookie, a.sectionId, 1);
    const parentA = await addParent(a.cookie, studentId, { portal: true });
    await mark(a.cookie, a.sectionId, [{ studentId, status: 'ABSENT' }]);

    expect((await get(b.cookie, `/attendance/absence-alerts?sectionId=${a.sectionId}&date=${todayIso()}`)).status).toBe(404);
    // A parent's scope is their own children, so a whole section is simply "not found" to them.
    expect((await get(parentA.parentCookie as string, `/attendance/absence-alerts?sectionId=${a.sectionId}&date=${todayIso()}`)).status).toBe(404);
    expect((await get(b.cookie, '/notifications')).body).toHaveLength(0);
  });
});
