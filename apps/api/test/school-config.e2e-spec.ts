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
import { isoWeekday } from '../src/common/school-calendar.util';

// School management: the school's profile, week, calendar and rules — and
// the proof that those rules are actually followed, not just stored.
// Through the real HTTP stack.

const WEB_ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct-horse-battery';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const PDF = Buffer.from('%PDF-1.4\n%test\n');
const GIF = Buffer.from('GIF89a' + 'x'.repeat(40));

const DAY_MS = 86_400_000;
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const shift = (iso: string, days: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);

describe('School management (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const sent: { to: string; subject: string }[] = [];

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
    sent.length = 0;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({
        isConfigured: true,
        send: async (mail: { to: string; subject: string }) => {
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
    await app.close();
  });

  const agent = () => request(app.getHttpServer());
  const send = (method: 'post' | 'patch' | 'put' | 'delete', cookie: string, path: string, body?: object) =>
    agent()[method](`/api/v1${path}`).set('Origin', WEB_ORIGIN).set('Cookie', cookie).send(body);
  const get = (cookie: string, path: string) => agent().get(`/api/v1${path}`).set('Cookie', cookie);

  async function register(name: string, email: string) {
    const res = await agent().post('/api/v1/schools/register').set('Origin', WEB_ORIGIN).send({ schoolName: name, directorFirstName: 'Dee', directorLastName: 'Rector', email, password: PASSWORD });
    return { cookie: res.headers['set-cookie'] as unknown as string, schoolId: res.body.schoolId as string };
  }

  async function invite(directorCookie: string, roleName: string, email: string) {
    const roles = await get(directorCookie, '/roles');
    const role = roles.body.find((r: { name: string }) => r.name === roleName);
    const inv = await send('post', directorCookie, '/memberships/invitations', { email, firstName: roleName, lastName: 'Person', roleId: role.id });
    await agent().post('/api/v1/auth/accept-invite').set('Origin', WEB_ORIGIN).send({ token: inv.body.inviteToken, password: 'zebra-lantern-pass-9' });
    const login = await agent().post('/api/v1/auth/login').set('Origin', WEB_ORIGIN).send({ email, password: 'zebra-lantern-pass-9' });
    const cookie = login.headers['set-cookie'] as unknown as string;
    const me = await get(cookie, '/auth/me');
    await send('post', cookie, '/auth/select-school', { membershipId: me.body.memberships[0].membershipId });
    return { cookie, userId: me.body.id as string };
  }

  async function academicSetup(cookie: string) {
    const year = await send('post', cookie, '/academic-years', { name: '2026-27', ...currentYearDates() });
    const klass = await send('post', cookie, '/classes', { academicYearId: year.body.id, name: 'Grade 5', order: 5 });
    const section = await send('post', cookie, `/classes/${klass.body.id}/sections`, { name: 'A' });
    return { yearId: year.body.id as string, classId: klass.body.id as string, sectionId: section.body.id as string };
  }

  let admission = 0;
  async function admit(cookie: string, sectionId?: string, first = 'Kid') {
    admission += 1;
    const res = await send('post', cookie, '/students', { admissionNo: `AD-${admission}`, firstName: first, lastName: 'Rao', ...(sectionId ? { sectionId } : {}) });
    return res.body.id as string;
  }

  // ---------------------------------------------------------------------
  describe('school profile, contact and address', () => {
    it('saves the profile, contact and address, clears a field when emptied, and never exposes the storage key', async () => {
      const { cookie } = await register('Profile School', 'profile1@example.test');
      const res = await send('patch', cookie, '/schools/me', {
        motto: 'Learn, lead, serve',
        description: 'A school for curious people.',
        schoolCode: 'PS-001',
        board: 'CBSE',
        schoolType: 'Senior secondary',
        establishedYear: 1998,
        affiliationNo: '2730123',
        alternatePhone: '+91 99999 00000',
        address: '12 Hill Road',
        city: 'Pune',
        state: 'Maharashtra',
        postalCode: '411001',
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ motto: 'Learn, lead, serve', board: 'CBSE', establishedYear: 1998, city: 'Pune', postalCode: '411001', hasLogo: false });
      expect(res.body.logoKey).toBeUndefined();

      const cleared = await send('patch', cookie, '/schools/me', { motto: '', establishedYear: null });
      expect(cleared.body.motto).toBeNull();
      expect(cleared.body.establishedYear).toBeNull();
      expect(cleared.body.city).toBe('Pune'); // untouched
    });

    it('rejects an impossible founding year and an oversized description', async () => {
      const { cookie } = await register('Bad Profile School', 'profile2@example.test');
      expect((await send('patch', cookie, '/schools/me', { establishedYear: 1700 })).status).toBe(400);
      expect((await send('patch', cookie, '/schools/me', { establishedYear: new Date().getFullYear() + 1 })).status).toBe(400);
      expect((await send('patch', cookie, '/schools/me', { description: 'x'.repeat(601) })).status).toBe(400);
    });

    it('lets only the Director change the profile; others can still read it', async () => {
      const { cookie } = await register('Who Edits School', 'profile3@example.test');
      const principal = await invite(cookie, 'Principal', 'principal3@example.test');
      expect((await send('patch', principal.cookie, '/schools/me', { motto: 'Mine now' })).status).toBe(403);
      expect((await get(principal.cookie, '/schools/me')).status).toBe(200);
    });

    it('stores a logo (PNG or JPEG by content), serves it to the school’s members, and removes it', async () => {
      const { cookie } = await register('Logo School', 'logo1@example.test');
      const teacher = await invite(cookie, 'Teacher', 'teacher-logo@example.test');

      expect((await get(cookie, '/schools/me/logo')).status).toBe(404);

      const fake = await agent().post('/api/v1/schools/me/logo').set('Origin', WEB_ORIGIN).set('Cookie', cookie).attach('file', GIF, { filename: 'logo.png', contentType: 'image/png' });
      expect(fake.status).toBe(400);
      const pdf = await agent().post('/api/v1/schools/me/logo').set('Origin', WEB_ORIGIN).set('Cookie', cookie).attach('file', PDF, { filename: 'logo.png', contentType: 'image/png' });
      expect(pdf.status).toBe(400);

      const ok = await agent().post('/api/v1/schools/me/logo').set('Origin', WEB_ORIGIN).set('Cookie', cookie).attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' });
      expect(ok.status).toBe(201);
      expect(ok.body.hasLogo).toBe(true);

      const served = await get(teacher.cookie, '/schools/me/logo');
      expect(served.status).toBe(200);
      expect(served.headers['content-type']).toContain('image/png');

      const teacherUpload = await agent().post('/api/v1/schools/me/logo').set('Origin', WEB_ORIGIN).set('Cookie', teacher.cookie).attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' });
      expect(teacherUpload.status).toBe(403);
      expect((await send('delete', teacher.cookie, '/schools/me/logo')).status).toBe(403);

      expect((await send('delete', cookie, '/schools/me/logo')).body.hasLogo).toBe(false);
      expect((await get(cookie, '/schools/me/logo')).status).toBe(404);
    });

    it('keeps one school’s logo out of another school’s hands', async () => {
      const a = await register('Logo A', 'logoa@example.test');
      const b = await register('Logo B', 'logob@example.test');
      await agent().post('/api/v1/schools/me/logo').set('Origin', WEB_ORIGIN).set('Cookie', a.cookie).attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' });
      expect((await get(b.cookie, '/schools/me/logo')).status).toBe(404);
      expect((await get(b.cookie, '/schools/me')).body.hasLogo).toBe(false);
    });
  });

  // ---------------------------------------------------------------------
  describe('timings, working days and the other settings', () => {
    it('starts with sensible defaults and saves changes', async () => {
      const { cookie } = await register('Settings School', 'settings1@example.test');
      const defaults = await get(cookie, '/school-settings');
      expect(defaults.status).toBe(200);
      expect(defaults.body).toMatchObject({ schoolStartTime: '08:00', workingDays: [1, 2, 3, 4, 5, 6], offSaturdays: [], attendanceEditWindowDays: 0, passPercent: 40, documentMaxSizeMb: 10 });
      expect(await prisma.schoolSettings.count()).toBe(0); // reading never writes

      const res = await send('patch', cookie, '/school-settings', { schoolStartTime: '07:45', schoolEndTime: '13:30', breakStartTime: '10:30', breakEndTime: '11:00', workingDays: [5, 1, 2, 3, 4], offSaturdays: [2, 4] });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ schoolStartTime: '07:45', workingDays: [1, 2, 3, 4, 5], offSaturdays: [2, 4] });
      expect((await get(cookie, '/school-settings')).body.schoolEndTime).toBe('13:30');
    });

    it('refuses a school day that ends before it starts, a break outside the day, a lone break time, and an empty week', async () => {
      const { cookie } = await register('Bad Settings School', 'settings2@example.test');
      expect((await send('patch', cookie, '/school-settings', { schoolStartTime: '15:00' })).status).toBe(400); // default end is 14:30
      expect((await send('patch', cookie, '/school-settings', { schoolEndTime: '07:00' })).status).toBe(400);
      expect((await send('patch', cookie, '/school-settings', { breakStartTime: '06:00', breakEndTime: '06:30' })).status).toBe(400);
      expect((await send('patch', cookie, '/school-settings', { breakStartTime: '12:00', breakEndTime: '11:00' })).status).toBe(400);
      expect((await send('patch', cookie, '/school-settings', { breakStartTime: null })).status).toBe(400);
      expect((await send('patch', cookie, '/school-settings', { workingDays: [] })).status).toBe(400);
      expect((await send('patch', cookie, '/school-settings', { workingDays: [1, 1, 2] })).status).toBe(400);
      expect((await send('patch', cookie, '/school-settings', { workingDays: [0, 8] })).status).toBe(400);
      expect((await send('patch', cookie, '/school-settings', { attendanceEditWindowDays: 31 })).status).toBe(400);
      expect((await send('patch', cookie, '/school-settings', { receiptPrefix: 'bad prefix!' })).status).toBe(400);
      expect((await send('patch', cookie, '/school-settings', { breakStartTime: null, breakEndTime: null })).status).toBe(200); // no break at all is fine
    });

    it('lets Director and Principal read the settings, only the Director change them, and keeps teachers out', async () => {
      const { cookie } = await register('Settings Access School', 'settings3@example.test');
      const principal = await invite(cookie, 'Principal', 'principal-s@example.test');
      const teacher = await invite(cookie, 'Teacher', 'teacher-s@example.test');
      expect((await get(principal.cookie, '/school-settings')).status).toBe(200);
      expect((await send('patch', principal.cookie, '/school-settings', { passPercent: 50 })).status).toBe(403);
      expect((await get(teacher.cookie, '/school-settings')).status).toBe(403);
      expect((await send('put', teacher.cookie, '/grading', {})).status).toBe(403);
    });

    it('keeps each school’s settings separate', async () => {
      const a = await register('Settings A', 'settingsa@example.test');
      const b = await register('Settings B', 'settingsb@example.test');
      await send('patch', a.cookie, '/school-settings', { passPercent: 60, workingDays: [1, 2, 3] });
      expect((await get(b.cookie, '/school-settings')).body).toMatchObject({ passPercent: 40, workingDays: [1, 2, 3, 4, 5, 6] });
    });
  });

  // ---------------------------------------------------------------------
  describe('working days and the attendance rules', () => {
    const mark = (cookie: string, sectionId: string, studentId: string, date: string, status = 'PRESENT') =>
      send('post', cookie, '/attendance', { sectionId, date, records: [{ studentId, status }] });

    async function schoolWithStudent(tag: string) {
      const { cookie, schoolId } = await register(`Attendance ${tag}`, `att-${tag}@example.test`);
      const { sectionId } = await academicSetup(cookie);
      const studentId = await admit(cookie, sectionId, 'Riya');
      return { cookie, schoolId, sectionId, studentId };
    }

    it('does not take attendance on a day the school is closed — until the school allows it', async () => {
      const { cookie, sectionId, studentId } = await schoolWithStudent('weekly');
      const today = todayIso();
      const closed = [1, 2, 3, 4, 5, 6, 7].filter((d) => d !== isoWeekday(today));
      await send('patch', cookie, '/school-settings', { workingDays: closed });

      const today404 = await get(cookie, '/attendance/today');
      expect(today404.body.schoolDay).toMatchObject({ working: false, reason: 'WEEKLY_OFF' });
      expect(today404.body.schoolDay.message).toMatch(/not a working day/);

      const blocked = await mark(cookie, sectionId, studentId, today);
      expect(blocked.status).toBe(400);
      expect(blocked.body.error.code).toBe('NOT_A_SCHOOL_DAY');

      await send('patch', cookie, '/school-settings', { attendanceOnNonWorkingDays: true });
      expect((await mark(cookie, sectionId, studentId, today)).status).toBe(201);
    });

    it('does not take attendance on a holiday, and names it', async () => {
      const { cookie, sectionId, studentId } = await schoolWithStudent('holiday');
      await send('patch', cookie, '/school-settings', { workingDays: [1, 2, 3, 4, 5, 6, 7] });
      const today = todayIso();
      await send('post', cookie, '/holidays', { name: 'Founders Day', type: 'SCHOOL', startDate: today, endDate: today });

      const blocked = await mark(cookie, sectionId, studentId, today);
      expect(blocked.status).toBe(400);
      expect(blocked.body.error.code).toBe('NOT_A_SCHOOL_DAY');
      expect(blocked.body.error.message).toContain('Founders Day');
      expect((await get(cookie, '/attendance/today')).body.schoolDay).toMatchObject({ working: false, reason: 'HOLIDAY' });
    });

    it('allows corrections only inside the school’s edit window, never ahead of time', async () => {
      const { cookie, sectionId, studentId } = await schoolWithStudent('window');
      await send('patch', cookie, '/school-settings', { workingDays: [1, 2, 3, 4, 5, 6, 7] });
      const today = todayIso();

      const defaultWindow = await mark(cookie, sectionId, studentId, shift(today, -1));
      expect(defaultWindow.status).toBe(400);
      expect(defaultWindow.body.error.code).toBe('ATTENDANCE_LOCKED');

      await send('patch', cookie, '/school-settings', { attendanceEditWindowDays: 2 });
      expect((await get(cookie, '/attendance/today')).body).toMatchObject({ today, editableFrom: shift(today, -2), editWindowDays: 2 });
      expect((await mark(cookie, sectionId, studentId, shift(today, -1))).status).toBe(201);
      expect((await mark(cookie, sectionId, studentId, shift(today, -2))).status).toBe(201);
      const tooOld = await mark(cookie, sectionId, studentId, shift(today, -3));
      expect(tooOld.status).toBe(400);
      expect(tooOld.body.error.message).toMatch(/2 days/);
      expect((await mark(cookie, sectionId, studentId, shift(today, 1))).status).toBe(400);
    });

    it('says which day an absence was for when a parent is told about an earlier day', async () => {
      const { cookie, sectionId, studentId } = await schoolWithStudent('late-alert');
      await send('patch', cookie, '/school-settings', { workingDays: [1, 2, 3, 4, 5, 6, 7], attendanceEditWindowDays: 3 });
      const parent = await send('post', cookie, '/parents', { firstName: 'Meera', lastName: 'Singh', email: 'meera-late@example.test' });
      await send('post', cookie, `/students/${studentId}/parents`, { parentId: parent.body.id, relation: 'Mother' });
      sent.length = 0;
      await mark(cookie, sectionId, studentId, shift(todayIso(), -1), 'ABSENT');
      const mail = sent.find((m) => m.to === 'meera-late@example.test');
      expect(mail?.subject).toMatch(/was marked absent on /);
      expect(mail?.subject).not.toMatch(/today/);
    });

    it('flags students whose attendance is below the school’s own minimum', async () => {
      const { cookie, schoolId, sectionId, studentId } = await schoolWithStudent('low');
      const me = await get(cookie, '/auth/me');
      const day = (n: number) => new Date(`${shift(todayIso(), -n)}T00:00:00Z`);
      for (const [n, status] of [[3, 'PRESENT'], [2, 'PRESENT'], [1, 'ABSENT']] as const) {
        await prisma.attendance.create({ data: { schoolId, studentId, sectionId, date: day(n), status, markedById: me.body.id } });
      }
      const query = `/reports/attendance?from=${shift(todayIso(), -5)}&to=${todayIso()}`;
      await send('patch', cookie, '/school-settings', { attendanceMinPercent: 75 }); // 2 of 3 present = 66.7%
      const low = (await get(cookie, query)).body.data[0];
      expect(low).toMatchObject({ attendancePercent: 66.7, lowAttendance: true });
      await send('patch', cookie, '/school-settings', { attendanceMinPercent: 60 });
      expect((await get(cookie, query)).body.data[0]).toMatchObject({ lowAttendance: false });
    });

    it('can turn off the absence email while the in-app alert is still recorded', async () => {
      const { cookie, sectionId, studentId } = await schoolWithStudent('mail-off');
      await send('patch', cookie, '/school-settings', { workingDays: [1, 2, 3, 4, 5, 6, 7], notifyAbsenceEmail: false });
      const parent = await send('post', cookie, '/parents', { firstName: 'Meera', lastName: 'Singh', email: 'meera-off@example.test' });
      await send('post', cookie, `/students/${studentId}/parents`, { parentId: parent.body.id, relation: 'Mother' });
      sent.length = 0;
      await mark(cookie, sectionId, studentId, todayIso(), 'ABSENT');
      expect(sent.filter((m) => m.to === 'meera-off@example.test')).toHaveLength(0);
      const emailAttempt = await prisma.absenceAlert.findFirstOrThrow({ where: { studentId, channel: 'EMAIL' } });
      expect(emailAttempt).toMatchObject({ status: 'SKIPPED' });
      expect(emailAttempt.detail).toMatch(/turned off/);
    });
  });

  // ---------------------------------------------------------------------
  describe('the school calendar', () => {
    it('shows each day as a working day or why it is not — weekly off, off-Saturday, or holiday', async () => {
      const { cookie } = await register('Calendar School', 'cal1@example.test');
      await send('patch', cookie, '/school-settings', { workingDays: [1, 2, 3, 4, 5, 6], offSaturdays: [2, 4] });
      await send('post', cookie, '/holidays', { name: 'Founders Day', type: 'SCHOOL', startDate: '2026-11-09', endDate: '2026-11-10' });
      await send('post', cookie, '/holidays', { name: 'Sunday Fair', type: 'OTHER', startDate: '2026-11-15', endDate: '2026-11-15' });

      const res = await get(cookie, '/calendar?from=2026-11-01&to=2026-11-30');
      expect(res.status).toBe(200);
      const day = (d: string) => res.body.days.find((x: { date: string }) => x.date === d);
      expect(day('2026-11-01')).toMatchObject({ weekday: 7, working: false, reason: 'WEEKLY_OFF' }); // Sunday
      expect(day('2026-11-02')).toMatchObject({ working: true, reason: null });
      expect(day('2026-11-07')).toMatchObject({ working: true }); // 1st Saturday works
      expect(day('2026-11-14')).toMatchObject({ working: false, reason: 'OFF_SATURDAY' }); // 2nd Saturday
      expect(day('2026-11-21')).toMatchObject({ working: true }); // 3rd Saturday works
      expect(day('2026-11-28')).toMatchObject({ working: false, reason: 'OFF_SATURDAY' }); // 4th Saturday
      expect(day('2026-11-09')).toMatchObject({ working: false, reason: 'HOLIDAY' });
      expect(day('2026-11-09').holidays[0].name).toBe('Founders Day');
      expect(day('2026-11-10')).toMatchObject({ reason: 'HOLIDAY' });
      expect(day('2026-11-15')).toMatchObject({ reason: 'WEEKLY_OFF' }); // a holiday on a day already off stays "weekly off"
      expect(day('2026-11-15').holidays).toHaveLength(1);

      // 30 days − 4 Sundays (1, 8, 15, 22, 29 = 5) − 2 off-Saturdays − 2 holiday weekdays
      expect(res.body.summary).toEqual({ workingDays: 30 - 5 - 2 - 2, holidays: 2, weeklyOff: 5 + 2 });
      expect(res.body.rules).toEqual({ workingDays: [1, 2, 3, 4, 5, 6], offSaturdays: [2, 4] });
    });

    it('includes terms and academic years that overlap the range, and defaults to the current month', async () => {
      const { cookie } = await register('Calendar Terms School', 'cal2@example.test');
      const { yearId } = await academicSetup(cookie);
      const year = (await get(cookie, '/academic-years')).body[0];
      const start = String(year.startDate).slice(0, 10);
      await send('post', cookie, `/academic-years/${yearId}/terms`, { name: 'Term 1', startDate: start, endDate: shift(start, 100) });

      const res = await get(cookie, `/calendar?from=${start}&to=${shift(start, 30)}`);
      expect(res.body.terms.map((t: { name: string }) => t.name)).toEqual(['Term 1']);
      expect(res.body.years.map((y: { name: string }) => y.name)).toEqual(['2026-27']);

      const month = await get(cookie, '/calendar');
      expect(month.body.from).toBe(`${todayIso().slice(0, 7)}-01`);
      expect(month.body.days.length).toBeGreaterThanOrEqual(28);
    });

    it('validates the range and is readable by teachers, but only within their own school', async () => {
      const a = await register('Calendar A', 'cala@example.test');
      const b = await register('Calendar B', 'calb@example.test');
      const teacher = await invite(a.cookie, 'Teacher', 'teacher-cal@example.test');
      expect((await get(teacher.cookie, '/calendar?from=2026-11-01&to=2026-11-07')).status).toBe(200);
      expect((await get(a.cookie, '/calendar?from=nope&to=2026-11-07')).status).toBe(400);
      expect((await get(a.cookie, '/calendar?from=2026-11-10&to=2026-11-01')).status).toBe(400);
      expect((await get(a.cookie, '/calendar?from=2026-01-01&to=2026-12-31')).status).toBe(400);
      await send('post', a.cookie, '/holidays', { name: 'Only A', type: 'SCHOOL', startDate: '2026-11-03', endDate: '2026-11-03' });
      const seenByB = await get(b.cookie, '/calendar?from=2026-11-01&to=2026-11-07');
      expect(seenByB.body.days.flatMap((d: { holidays: unknown[] }) => d.holidays)).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------
  describe('academic terms', () => {
    async function yearWithDates() {
      const { cookie, schoolId } = await register('Terms School', `terms-${Date.now()}@example.test`);
      const { yearId } = await academicSetup(cookie);
      const year = (await get(cookie, '/academic-years')).body.find((y: { id: string }) => y.id === yearId);
      return { cookie, schoolId, yearId, start: String(year.startDate).slice(0, 10), end: String(year.endDate).slice(0, 10) };
    }

    it('adds, lists in date order, edits and removes terms', async () => {
      const { cookie, yearId, start } = await yearWithDates();
      const t2 = await send('post', cookie, `/academic-years/${yearId}/terms`, { name: 'Term 2', startDate: shift(start, 150), endDate: shift(start, 250) });
      expect(t2.status).toBe(201);
      const t1 = await send('post', cookie, `/academic-years/${yearId}/terms`, { name: 'Term 1', startDate: start, endDate: shift(start, 120) });
      expect(t1.status).toBe(201);
      expect((await get(cookie, `/academic-years/${yearId}/terms`)).body.map((t: { name: string }) => t.name)).toEqual(['Term 1', 'Term 2']);

      const renamed = await send('patch', cookie, `/academic-years/${yearId}/terms/${t1.body.id}`, { name: 'Autumn term' });
      expect(renamed.body.name).toBe('Autumn term');
      expect((await send('delete', cookie, `/academic-years/${yearId}/terms/${t2.body.id}`)).status).toBe(200);
      expect((await get(cookie, `/academic-years/${yearId}/terms`)).body).toHaveLength(1);
    });

    it('keeps terms inside the year and apart from each other', async () => {
      const { cookie, yearId, start, end } = await yearWithDates();
      const base = await send('post', cookie, `/academic-years/${yearId}/terms`, { name: 'Term 1', startDate: start, endDate: shift(start, 100) });
      expect((await send('post', cookie, `/academic-years/${yearId}/terms`, { name: 'Early', startDate: shift(start, -5), endDate: shift(start, -1) })).status).toBe(400);
      expect((await send('post', cookie, `/academic-years/${yearId}/terms`, { name: 'Late', startDate: shift(end, -5), endDate: shift(end, 5) })).status).toBe(400);
      const overlap = await send('post', cookie, `/academic-years/${yearId}/terms`, { name: 'Overlap', startDate: shift(start, 100), endDate: shift(start, 150) });
      expect(overlap.status).toBe(400);
      expect(overlap.body.error.message).toContain('Term 1');
      expect((await send('post', cookie, `/academic-years/${yearId}/terms`, { name: 'term 1', startDate: shift(start, 120), endDate: shift(start, 150) })).status).toBe(400);
      expect((await send('post', cookie, `/academic-years/${yearId}/terms`, { name: 'Backwards', startDate: shift(start, 50), endDate: shift(start, 40) })).status).toBe(400);
      // moving a term onto itself is not an overlap
      expect((await send('patch', cookie, `/academic-years/${yearId}/terms/${base.body.id}`, { endDate: shift(start, 110) })).status).toBe(200);
    });

    it('is open to those who may update the year (Principal) and closed to everyone else — and to other schools', async () => {
      const { cookie, yearId, start } = await yearWithDates();
      const principal = await invite(cookie, 'Principal', 'principal-t@example.test');
      const teacher = await invite(cookie, 'Teacher', 'teacher-t@example.test');
      expect((await send('post', principal.cookie, `/academic-years/${yearId}/terms`, { name: 'Term 1', startDate: start, endDate: shift(start, 90) })).status).toBe(201);
      expect((await send('post', teacher.cookie, `/academic-years/${yearId}/terms`, { name: 'Sneaky', startDate: shift(start, 100), endDate: shift(start, 120) })).status).toBe(403);

      const other = await register('Other Terms School', 'terms-other@example.test');
      expect((await get(other.cookie, `/academic-years/${yearId}/terms`)).status).toBe(404);
      expect((await send('post', other.cookie, `/academic-years/${yearId}/terms`, { name: 'Hijack', startDate: start, endDate: shift(start, 5) })).status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------
  describe('departments', () => {
    it('creates, edits and lists departments with their head, teachers and subjects', async () => {
      const { cookie, schoolId } = await register('Dept School', 'dept1@example.test');
      const staff = await invite(cookie, 'Teacher', 'teacher-d@example.test');
      const teacher = await send('post', cookie, '/teachers', { userId: staff.userId });
      expect(teacher.status).toBe(201);

      const science = await send('post', cookie, '/departments', { name: 'Science', code: 'SCI', description: 'Physics, chemistry, biology', headTeacherId: teacher.body.id });
      expect(science.status).toBe(201);
      expect(science.body).toMatchObject({ name: 'Science', code: 'SCI', teacherCount: 0, subjectCount: 0 });
      expect(science.body.headTeacher.id).toBe(teacher.body.id);

      const physics = await send('post', cookie, '/subjects', { name: 'Physics', departmentId: science.body.id });
      expect(physics.body.department).toMatchObject({ name: 'Science' });
      expect((await send('patch', cookie, `/teachers/${teacher.body.id}`, { departmentId: science.body.id })).body.department).toMatchObject({ name: 'Science' });

      const detail = await get(cookie, `/departments/${science.body.id}`);
      expect(detail.body).toMatchObject({ teacherCount: 1, subjectCount: 1 });
      expect(detail.body.subjects.map((s: { name: string }) => s.name)).toEqual(['Physics']);
      expect(detail.body.teachers).toHaveLength(1);

      const renamed = await send('patch', cookie, `/departments/${science.body.id}`, { name: 'Sciences', headTeacherId: '' });
      expect(renamed.body).toMatchObject({ name: 'Sciences', headTeacher: null });
      expect((await get(cookie, '/departments')).body).toHaveLength(1);
      expect(await prisma.department.count({ where: { schoolId } })).toBe(1);
    });

    it('refuses duplicate names (any letter case), unknown heads and unknown departments', async () => {
      const { cookie } = await register('Dept Rules School', 'dept2@example.test');
      await send('post', cookie, '/departments', { name: 'Languages' });
      const dup = await send('post', cookie, '/departments', { name: 'languages' });
      expect(dup.status).toBe(400);
      expect(dup.body.error.details[0].field).toBe('name');
      expect((await send('post', cookie, '/departments', { name: 'Maths', headTeacherId: 'nobody' })).status).toBe(400);
      expect((await send('post', cookie, '/subjects', { name: 'Hindi', departmentId: 'nope' })).status).toBe(400);
      expect((await send('post', cookie, '/departments', { name: 'x' })).status).toBe(400);
    });

    it('removing a department keeps its subjects and teachers, just unassigned — and frees the name', async () => {
      const { cookie } = await register('Dept Remove School', 'dept3@example.test');
      const dept = await send('post', cookie, '/departments', { name: 'Arts' });
      const subject = await send('post', cookie, '/subjects', { name: 'Drawing', departmentId: dept.body.id });
      expect((await send('delete', cookie, `/departments/${dept.body.id}`)).status).toBe(200);
      const subjects = await get(cookie, '/subjects');
      expect(subjects.body.find((s: { id: string }) => s.id === subject.body.id).department).toBeNull();
      expect((await get(cookie, `/departments/${dept.body.id}`)).status).toBe(404);
      expect((await send('post', cookie, '/departments', { name: 'Arts' })).status).toBe(201);
    });

    it('lets teachers see departments but not change them, and keeps schools apart', async () => {
      const a = await register('Dept A', 'depta@example.test');
      const b = await register('Dept B', 'deptb@example.test');
      const teacher = await invite(a.cookie, 'Teacher', 'teacher-da@example.test');
      const dept = await send('post', a.cookie, '/departments', { name: 'Sports' });
      expect((await get(teacher.cookie, '/departments')).status).toBe(200);
      expect((await send('post', teacher.cookie, '/departments', { name: 'Mine' })).status).toBe(403);
      expect((await send('delete', teacher.cookie, `/departments/${dept.body.id}`)).status).toBe(403);

      expect((await get(b.cookie, '/departments')).body).toHaveLength(0);
      expect((await get(b.cookie, `/departments/${dept.body.id}`)).status).toBe(404);
      expect((await send('patch', b.cookie, `/departments/${dept.body.id}`, { name: 'Stolen' })).status).toBe(404);
      expect((await send('delete', b.cookie, `/departments/${dept.body.id}`)).status).toBe(404);
      const bSubject = await send('post', b.cookie, '/subjects', { name: 'Chess', departmentId: dept.body.id });
      expect(bSubject.status).toBe(400); // another school's department isn't usable
    });
  });

  // ---------------------------------------------------------------------
  describe('houses and groups', () => {
    it('creates houses, clubs and groups and fills them with students', async () => {
      const { cookie } = await register('House School', 'house1@example.test');
      const { sectionId } = await academicSetup(cookie);
      const s1 = await admit(cookie, sectionId, 'Asha');
      const s2 = await admit(cookie, sectionId, 'Bala');

      const red = await send('post', cookie, '/groups', { name: 'Red House', kind: 'HOUSE', color: '#dc2626', motto: 'Fire' });
      expect(red.status).toBe(201);
      expect(red.body).toMatchObject({ kind: 'HOUSE', color: '#dc2626', memberCount: 0 });
      const chess = await send('post', cookie, '/groups', { name: 'Chess Club', kind: 'CLUB' });

      expect((await send('post', cookie, `/groups/${red.body.id}/members`, { studentIds: [s1, s2] })).body.added).toBe(2);
      expect((await send('post', cookie, `/groups/${red.body.id}/members`, { studentIds: [s1] })).body.added).toBe(0); // already in
      await send('post', cookie, `/groups/${chess.body.id}/members`, { studentIds: [s1] });

      const detail = await get(cookie, `/groups/${red.body.id}`);
      expect(detail.body.memberCount).toBe(2);
      expect(detail.body.members.map((m: { name: string }) => m.name)).toEqual(['Asha Rao', 'Bala Rao']);
      expect(detail.body.members[0].className).toBe('Grade 5 A');

      const mine = await get(cookie, `/groups/student/${s1}`);
      expect(mine.body.map((g: { name: string }) => g.name)).toEqual(['Chess Club', 'Red House']);
      expect((await get(cookie, '/groups?kind=CLUB')).body).toHaveLength(1);

      expect((await send('delete', cookie, `/groups/${red.body.id}/members/${s2}`)).status).toBe(200);
      expect((await send('delete', cookie, `/groups/${red.body.id}/members/${s2}`)).status).toBe(404);
      expect((await get(cookie, `/groups/${red.body.id}`)).body.memberCount).toBe(1);
    });

    it('puts a student in only one house, but lets them join any number of clubs', async () => {
      const { cookie } = await register('One House School', 'house2@example.test');
      const student = await admit(cookie, undefined, 'Chitra');
      const red = await send('post', cookie, '/groups', { name: 'Red', kind: 'HOUSE' });
      const blue = await send('post', cookie, '/groups', { name: 'Blue', kind: 'HOUSE' });
      await send('post', cookie, `/groups/${red.body.id}/members`, { studentIds: [student] });

      const clash = await send('post', cookie, `/groups/${blue.body.id}/members`, { studentIds: [student] });
      expect(clash.status).toBe(400);
      expect(clash.body.error.code).toBe('ALREADY_IN_HOUSE');
      expect(clash.body.error.message).toContain('Red');

      for (const name of ['Chess', 'Drama', 'Football']) {
        const club = await send('post', cookie, '/groups', { name, kind: 'CLUB' });
        expect((await send('post', cookie, `/groups/${club.body.id}/members`, { studentIds: [student] })).status).toBe(201);
      }
      // a club can't be turned into a house while it would put someone in two
      const chessClub = (await get(cookie, '/groups?kind=CLUB')).body.find((g: { name: string }) => g.name === 'Chess');
      expect((await send('patch', cookie, `/groups/${chessClub.id}`, { kind: 'HOUSE' })).body.error.code).toBe('ALREADY_IN_HOUSE');
    });

    it('rejects duplicate names, bad colours and students from another school', async () => {
      const a = await register('Group A', 'groupa@example.test');
      const b = await register('Group B', 'groupb@example.test');
      const group = await send('post', a.cookie, '/groups', { name: 'Green', kind: 'HOUSE' });
      expect((await send('post', a.cookie, '/groups', { name: 'GREEN', kind: 'CLUB' })).status).toBe(400);
      expect((await send('post', a.cookie, '/groups', { name: 'Purple', color: 'purple' })).status).toBe(400);
      expect((await send('post', a.cookie, '/groups', { name: 'Led', leaderTeacherId: 'nobody' })).status).toBe(400);
      const bStudent = await admit(b.cookie, undefined, 'Other');
      expect((await send('post', a.cookie, `/groups/${group.body.id}/members`, { studentIds: [bStudent] })).status).toBe(400);
      expect((await send('post', a.cookie, `/groups/${group.body.id}/members`, { studentIds: [] })).status).toBe(400);
    });

    it('deleting a group frees the name and drops its memberships; other schools cannot touch it', async () => {
      const a = await register('Group Del A', 'groupdela@example.test');
      const b = await register('Group Del B', 'groupdelb@example.test');
      const student = await admit(a.cookie, undefined, 'Dev');
      const group = await send('post', a.cookie, '/groups', { name: 'Yellow', kind: 'HOUSE' });
      await send('post', a.cookie, `/groups/${group.body.id}/members`, { studentIds: [student] });

      expect((await get(b.cookie, `/groups/${group.body.id}`)).status).toBe(404);
      expect((await send('patch', b.cookie, `/groups/${group.body.id}`, { name: 'Stolen' })).status).toBe(404);
      expect((await send('post', b.cookie, `/groups/${group.body.id}/members`, { studentIds: [student] })).status).toBe(404);
      expect((await send('delete', b.cookie, `/groups/${group.body.id}`)).status).toBe(404);

      expect((await send('delete', a.cookie, `/groups/${group.body.id}`)).status).toBe(200);
      expect((await get(a.cookie, `/groups/student/${student}`)).body).toHaveLength(0);
      expect((await send('post', a.cookie, '/groups', { name: 'Yellow', kind: 'HOUSE' })).status).toBe(201);
    });

    it('lets teachers see groups but not change them; a teacher sees the houses only of students they may see', async () => {
      const { cookie } = await register('Group Access School', 'groupacc@example.test');
      const teacher = await invite(cookie, 'Teacher', 'teacher-g@example.test');
      const student = await admit(cookie, undefined, 'Esha');
      const group = await send('post', cookie, '/groups', { name: 'Gold', kind: 'HOUSE' });
      expect((await get(teacher.cookie, '/groups')).status).toBe(200);
      expect((await send('post', teacher.cookie, '/groups', { name: 'Mine' })).status).toBe(403);
      expect((await send('post', teacher.cookie, `/groups/${group.body.id}/members`, { studentIds: [student] })).status).toBe(403);
      // not one of this teacher's students → the student record itself is out of reach
      expect((await get(teacher.cookie, `/groups/student/${student}`)).status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------
  describe('grading', () => {
    const bands = [
      { label: 'Distinction', minPercent: 75, gradePoint: 4, remark: 'Excellent' },
      { label: 'Merit', minPercent: 60, gradePoint: 3 },
      { label: 'Pass', minPercent: 40, gradePoint: 2 },
      { label: 'Fail', minPercent: 0, gradePoint: 0 },
    ];

    it('starts with a default scale, replaces it as a whole, and reads back in order', async () => {
      const { cookie } = await register('Grading School', 'grade1@example.test');
      const start = await get(cookie, '/grading');
      expect(start.body.isDefault).toBe(true);
      expect(start.body.bands[0]).toMatchObject({ label: 'A+', minPercent: 90 });
      expect(start.body.passPercent).toBe(40);

      const res = await send('put', cookie, '/grading', { passPercent: 45, bands: [...bands].reverse() });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ isDefault: false, passPercent: 45 });
      expect(res.body.bands.map((b: { label: string }) => b.label)).toEqual(['Distinction', 'Merit', 'Pass', 'Fail']);
      expect((await get(cookie, '/school-settings')).body.passPercent).toBe(45);

      const replaced = await send('put', cookie, '/grading', { passPercent: 33, bands: [{ label: 'P', minPercent: 33 }, { label: 'F', minPercent: 0 }] });
      expect(replaced.body.bands).toHaveLength(2);
      expect(await prisma.gradeBand.count()).toBe(2);
    });

    it('tells what a percentage earns, and whether it passes', async () => {
      const { cookie } = await register('Preview School', 'grade2@example.test');
      await send('put', cookie, '/grading', { passPercent: 45, bands });
      expect((await get(cookie, '/grading/preview?percent=82')).body).toMatchObject({ label: 'Distinction', gradePoint: 4, passed: true });
      expect((await get(cookie, '/grading/preview?percent=75')).body).toMatchObject({ label: 'Distinction' }); // boundary belongs to the higher grade
      expect((await get(cookie, '/grading/preview?percent=74.9')).body).toMatchObject({ label: 'Merit' });
      expect((await get(cookie, '/grading/preview?percent=42')).body).toMatchObject({ label: 'Pass', passed: false }); // pass mark is 45
      expect((await get(cookie, '/grading/preview?percent=0')).body).toMatchObject({ label: 'Fail', passed: false });
      expect((await get(cookie, '/grading/preview?percent=100')).body.label).toBe('Distinction');
      expect((await get(cookie, '/grading/preview?percent=101')).status).toBe(400);
      expect((await get(cookie, '/grading/preview?percent=-1')).status).toBe(400);
      expect((await get(cookie, '/grading/preview?percent=abc')).status).toBe(400);
      expect((await get(cookie, '/grading/preview')).status).toBe(400);
    });

    it('refuses a scale with a gap at the bottom, duplicates, or nonsense numbers', async () => {
      const { cookie } = await register('Bad Grading School', 'grade3@example.test');
      const put = (body: object) => send('put', cookie, '/grading', body);
      expect((await put({ passPercent: 40, bands: [{ label: 'A', minPercent: 80 }, { label: 'B', minPercent: 40 }] })).status).toBe(400); // nothing starts at 0
      expect((await put({ passPercent: 40, bands: [{ label: 'A', minPercent: 50 }, { label: 'B', minPercent: 50 }, { label: 'C', minPercent: 0 }] })).status).toBe(400);
      expect((await put({ passPercent: 40, bands: [{ label: 'A', minPercent: 50 }, { label: 'a', minPercent: 0 }] })).status).toBe(400);
      expect((await put({ passPercent: 40, bands: [{ label: 'A', minPercent: 101 }, { label: 'B', minPercent: 0 }] })).status).toBe(400);
      expect((await put({ passPercent: 0, bands })).status).toBe(400);
      expect((await put({ passPercent: 40, bands: [{ label: 'Only', minPercent: 0 }] })).status).toBe(400);
      expect((await get(cookie, '/grading')).body.isDefault).toBe(true); // nothing half-saved
    });

    it('keeps each school’s scale to itself', async () => {
      const a = await register('Grade A', 'gradea@example.test');
      const b = await register('Grade B', 'gradeb@example.test');
      await send('put', a.cookie, '/grading', { passPercent: 50, bands });
      expect((await get(b.cookie, '/grading')).body).toMatchObject({ isDefault: true, passPercent: 40 });
    });
  });

  // ---------------------------------------------------------------------
  describe('fee rules', () => {
    const structures = new Map<string, string>(); // one fee structure per school, shared by its students
    async function feeFor(cookie: string, dueDate?: string, amountMinor = 100000) {
      if (!structures.has(cookie)) {
        const { yearId } = await academicSetup(cookie);
        const category = await send('post', cookie, '/fee-categories', { name: 'Tuition' });
        const created = await send('post', cookie, '/fee-structures', { feeCategoryId: category.body.id, academicYearId: yearId, amountMinor, frequency: 'MONTHLY' });
        structures.set(cookie, created.body.id);
      }
      const structure = { body: { id: structures.get(cookie) } };
      const studentId = await admit(cookie, undefined, 'Fee');
      const fee = await send('post', cookie, `/students/${studentId}/fees`, { feeStructureId: structure.body.id, ...(dueDate ? { dueDate } : {}) });
      return { studentFeeId: fee.body.id as string, studentId };
    }

    it('numbers receipts with the school’s own prefix', async () => {
      const { cookie } = await register('Receipt School', 'rcpt1@example.test');
      await send('patch', cookie, '/school-settings', { receiptPrefix: 'SPS/' });
      const { studentFeeId } = await feeFor(cookie);
      const pay = await send('post', cookie, `/student-fees/${studentFeeId}/payments`, { amountMinor: 40000, method: 'CASH' });
      expect(pay.status).toBe(201);
      expect(pay.body.receipt.receiptNo).toBe('SPS/000001');
      const second = await send('post', cookie, `/student-fees/${studentFeeId}/payments`, { amountMinor: 1000, method: 'CASH' });
      expect(second.body.receipt.receiptNo).toBe('SPS/000002');
    });

    it('can insist on full payment, and says what the full amount is', async () => {
      const { cookie } = await register('Full Pay School', 'rcpt2@example.test');
      await send('patch', cookie, '/school-settings', { allowPartialPayments: false });
      const { studentFeeId } = await feeFor(cookie);
      const part = await send('post', cookie, `/student-fees/${studentFeeId}/payments`, { amountMinor: 40000, method: 'CASH' });
      expect(part.status).toBe(400);
      expect(part.body.error.code).toBe('PARTIAL_PAYMENT_NOT_ALLOWED');
      expect((await send('post', cookie, `/student-fees/${studentFeeId}/payments`, { amountMinor: 100000, method: 'CASH' })).status).toBe(201);

      await send('patch', cookie, '/school-settings', { allowPartialPayments: true });
      const other = await feeFor(cookie);
      expect((await send('post', cookie, `/student-fees/${other.studentFeeId}/payments`, { amountMinor: 40000, method: 'CASH' })).status).toBe(201);
    });

    it('shows the late fee on an overdue balance — after the grace days, per day, never once paid', async () => {
      const { cookie } = await register('Late Fee School', 'rcpt3@example.test');
      await send('patch', cookie, '/school-settings', { lateFeePerDayMinor: 5000, lateFeeGraceDays: 3 });
      const due = shift(todayIso(), -10);
      const { studentFeeId, studentId } = await feeFor(cookie, due);

      const overdue = (await get(cookie, `/students/${studentId}/fees`)).body[0];
      expect(overdue).toMatchObject({ daysLate: 7, lateFeeMinor: 35000, balanceMinor: 100000, amountDueMinor: 100000 }); // billed amount unchanged

      const report = await get(cookie, '/fees/outstanding');
      expect(report.body[0]).toMatchObject({ daysLate: 7, lateFeeMinor: 35000 });

      await send('post', cookie, `/student-fees/${studentFeeId}/payments`, { amountMinor: 100000, method: 'CASH' });
      expect((await get(cookie, `/students/${studentId}/fees`)).body[0]).toMatchObject({ daysLate: 0, lateFeeMinor: 0 });
    });

    it('charges no late fee inside the grace period or when the school has set none', async () => {
      const { cookie } = await register('No Late Fee School', 'rcpt4@example.test');
      const { studentId } = await feeFor(cookie, shift(todayIso(), -2));
      expect((await get(cookie, `/students/${studentId}/fees`)).body[0]).toMatchObject({ daysLate: 2, lateFeeMinor: 0 }); // late, but the school charges nothing
      await send('patch', cookie, '/school-settings', { lateFeePerDayMinor: 100, lateFeeGraceDays: 5 });
      expect((await get(cookie, `/students/${studentId}/fees`)).body[0]).toMatchObject({ daysLate: 0, lateFeeMinor: 0 });
    });
  });

  // ---------------------------------------------------------------------
  describe('notification rules', () => {
    it('lets a school stop the email that asks the Director to approve an academic year — the in-app notice still arrives', async () => {
      const { cookie } = await register('Notify School', 'notify1@example.test');
      const principal = await invite(cookie, 'Principal', 'principal-n@example.test');
      sent.length = 0;
      const dates = { startDate: '2040-04-01', endDate: '2041-03-31' };
      await send('post', principal.cookie, '/academic-years', { name: '2040-41', ...dates });
      const mails = sent.filter((m) => /needs your approval/.test(m.subject));
      expect(mails.length).toBe(1);

      await send('patch', cookie, '/school-settings', { notifyYearApprovalEmail: false });
      sent.length = 0;
      await send('post', principal.cookie, '/academic-years', { name: '2041-42', startDate: '2041-04-01', endDate: '2042-03-31' });
      expect(sent.filter((m) => /needs your approval/.test(m.subject))).toHaveLength(0);
      const notices = await get(cookie, '/notifications');
      expect(notices.body.filter((n: { title: string }) => /needs your approval/.test(n.title)).length).toBe(2);
    });
  });

  // ---------------------------------------------------------------------
  describe('document rules', () => {
    const upload = (cookie: string, studentId: string, file: Buffer, name: string, type: string, category?: string) => {
      let r = agent().post(`/api/v1/students/${studentId}/documents`).set('Origin', WEB_ORIGIN).set('Cookie', cookie);
      if (category !== undefined) r = r.field('category', category);
      return r.attach('file', file, { filename: name, contentType: type });
    };

    it('publishes what the school accepts', async () => {
      const { cookie } = await register('Doc Config School', 'doc1@example.test');
      await send('patch', cookie, '/school-settings', { documentCategories: ['ID proof', 'Report card'], requiredStudentDocuments: ['ID proof'], documentMaxSizeMb: 3, allowedDocumentTypes: ['application/pdf'] });
      expect((await get(cookie, '/documents/config')).body).toEqual({ maxSizeMb: 3, allowedTypes: ['application/pdf'], categories: ['ID proof', 'Report card'], requiredStudentDocuments: ['ID proof'] });
    });

    it('applies the school’s size limit and allowed types', async () => {
      const { cookie } = await register('Doc Limit School', 'doc2@example.test');
      const student = await admit(cookie, undefined, 'Doc');
      const big = Buffer.concat([PDF, Buffer.alloc(1_200_000)]);

      expect((await upload(cookie, student, big, 'big.pdf', 'application/pdf')).status).toBe(201); // 10 MB by default
      await send('patch', cookie, '/school-settings', { documentMaxSizeMb: 1 });
      const tooBig = await upload(cookie, student, big, 'big.pdf', 'application/pdf');
      expect(tooBig.status).toBe(400);
      expect(tooBig.body.error.message).toContain('max 1 MB');

      await send('patch', cookie, '/school-settings', { allowedDocumentTypes: ['application/pdf'] });
      const png = await upload(cookie, student, PNG, 'scan.png', 'image/png');
      expect(png.status).toBe(400);
      expect(png.body.error.message).toBe('Unsupported file type. Allowed: PDF.');
      expect((await upload(cookie, student, PDF, 'ok.pdf', 'application/pdf')).status).toBe(201);
    });

    it('saves a document under one of the school’s categories, and refuses any other', async () => {
      const { cookie } = await register('Doc Category School', 'doc3@example.test');
      const student = await admit(cookie, undefined, 'Cat');
      const ok = await upload(cookie, student, PDF, 'birth.pdf', 'application/pdf', 'birth certificate');
      expect(ok.status).toBe(201);
      expect(ok.body.category).toBe('Birth certificate'); // stored the way the school spells it

      expect((await upload(cookie, student, PDF, 'x.pdf', 'application/pdf', 'Secret stuff')).status).toBe(400);
      const none = await upload(cookie, student, PDF, 'y.pdf', 'application/pdf');
      expect(none.status).toBe(201);
      expect(none.body.category).toBeNull();
      expect((await get(cookie, `/students/${student}/documents`)).body.map((d: { category: string | null }) => d.category).sort()).toEqual(['Birth certificate', null]);
    });

    it('will not require a document that is not one of the categories', async () => {
      const { cookie } = await register('Doc Required School', 'doc4@example.test');
      const bad = await send('patch', cookie, '/school-settings', { requiredStudentDocuments: ['Passport'] });
      expect(bad.status).toBe(400);
      expect(bad.body.error.message).toContain('Passport');
      expect((await send('patch', cookie, '/school-settings', { documentCategories: ['Passport'], requiredStudentDocuments: ['passport'] })).status).toBe(200);
      expect((await send('patch', cookie, '/school-settings', { documentCategories: ['A', 'a'] })).status).toBe(400); // duplicates
      expect((await send('patch', cookie, '/school-settings', { allowedDocumentTypes: [] })).status).toBe(400);
      expect((await send('patch', cookie, '/school-settings', { allowedDocumentTypes: ['application/zip'] })).status).toBe(400);
      expect((await send('patch', cookie, '/school-settings', { documentMaxSizeMb: 26 })).status).toBe(400);
    });

    it('applies the same rules to profile documents, and keeps config per school', async () => {
      const a = await register('Doc A', 'doca@example.test');
      const b = await register('Doc B', 'docb@example.test');
      await send('patch', a.cookie, '/school-settings', { documentMaxSizeMb: 1 });
      const big = Buffer.concat([PDF, Buffer.alloc(1_200_000)]);
      const mine = await agent().post('/api/v1/me/documents').set('Origin', WEB_ORIGIN).set('Cookie', a.cookie).attach('file', big, { filename: 'big.pdf', contentType: 'application/pdf' });
      expect(mine.status).toBe(400);
      const theirs = await agent().post('/api/v1/me/documents').set('Origin', WEB_ORIGIN).set('Cookie', b.cookie).attach('file', big, { filename: 'big.pdf', contentType: 'application/pdf' });
      expect(theirs.status).toBe(201);
    });
  });
});
