import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { NoticesService } from '../src/notices/notices.service';
import { openAllWeek, resetTestData } from './db-helpers';
import { permissionCatalog } from '../prisma/seed-data/permissions';
import { currentYearDates } from './year-helpers';

// The Teacher role end to end: what a teacher can reach (their own classes, subjects and students — and
// nothing else), and every workflow they take part in: attendance and its corrections, timetable and cover,
// homework and assignments, study material, exams and the marks approval chain, remarks, messages with
// parents, class announcements, leave, the dashboard and reports.

const WEB_ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct-horse-battery';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

describe('Teacher workspace (e2e)', () => {
  let app: INestApplication;
  const db = new PrismaClient();

  beforeAll(async () => {
    for (const permission of permissionCatalog) await db.permission.upsert({ where: { key: permission.key }, update: {}, create: permission });
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  beforeEach(async () => {
    await resetTestData(db);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await app.close();
  });

  const agent = () => request(app.getHttpServer());
  const post = (cookie: string, url: string, body: object = {}) => agent().post(`/api/v1${url}`).set('Origin', WEB_ORIGIN).set('Cookie', cookie).send(body);
  const put = (cookie: string, url: string, body: object = {}) => agent().put(`/api/v1${url}`).set('Origin', WEB_ORIGIN).set('Cookie', cookie).send(body);
  const patch = (cookie: string, url: string, body: object = {}) => agent().patch(`/api/v1${url}`).set('Origin', WEB_ORIGIN).set('Cookie', cookie).send(body);
  const get = (cookie: string, url: string) => agent().get(`/api/v1${url}`).set('Cookie', cookie);
  const del = (cookie: string, url: string) => agent().delete(`/api/v1${url}`).set('Origin', WEB_ORIGIN).set('Cookie', cookie);
  const code = (res: { body: { error?: { code?: string }; code?: string } }) => res.body.error?.code ?? res.body.code;
  const binary = (r: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = [];
    r.on('data', (c: Buffer) => chunks.push(c));
    r.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  async function registerSchool(name: string, email: string) {
    const res = await agent().post('/api/v1/schools/register').set('Origin', WEB_ORIGIN).send({ schoolName: name, directorFirstName: 'D', directorLastName: 'R', email, password: PASSWORD });
    return { schoolId: res.body.schoolId as string, cookie: res.headers['set-cookie'] as unknown as string };
  }
  async function loginAs(email: string) {
    const login = await agent().post('/api/v1/auth/login').set('Origin', WEB_ORIGIN).send({ email, password: PASSWORD });
    const cookie = login.headers['set-cookie'] as unknown as string;
    const me = await agent().get('/api/v1/auth/me').set('Cookie', cookie);
    await post(cookie, '/auth/select-school', { membershipId: me.body.memberships[0].membershipId });
    return cookie;
  }
  async function invite(director: string, roleName: string, email: string, firstName: string) {
    const roles = await get(director, '/roles');
    const role = roles.body.find((r: { name: string }) => r.name === roleName);
    const inv = await post(director, '/memberships/invitations', { email, firstName, lastName: 'Test', roleId: role.id });
    await agent().post('/api/v1/auth/accept-invite').set('Origin', WEB_ORIGIN).send({ token: inv.body.inviteToken, password: PASSWORD });
    return { cookie: await loginAs(email), userId: inv.body.userId as string };
  }

  interface World {
    schoolId: string;
    director: string;
    principal: string;
    t1: string; // Maths in 6A, class teacher of 6A
    t2: string; // English in 6A, Maths in 6B
    t3: string; // English in 8A
    teacher: { t1: string; t2: string; t3: string };
    parent: string; // parent of s1 (6A)
    parent2: string; // parent of s5 (8A)
    parentId: string;
    yearId: string;
    sec: { a6: string; b6: string; a8: string };
    cls: { g6: string; g8: string };
    sub: { maths: string; english: string };
    s: string[]; // s[0..2] in 6A, s[3] in 6B, s[4] in 8A
    users: { t1: string; t2: string; t3: string };
  }

  /** A school with Grade 6 (A, B) and Grade 8 (A), two subjects, five students, three teachers, a principal and two parents. */
  async function world(suffix = '1'): Promise<World> {
    const { cookie: director, schoolId } = await registerSchool(`Teach School ${suffix}`, `director${suffix}@example.test`);
    await openAllWeek(db, schoolId);
    const ay = await post(director, '/academic-years', { name: '2025-26', ...currentYearDates() });
    const g6 = await post(director, '/classes', { academicYearId: ay.body.id, name: 'Grade 6', order: 6 });
    const g8 = await post(director, '/classes', { academicYearId: ay.body.id, name: 'Grade 8', order: 8 });
    const a6 = await post(director, `/classes/${g6.body.id}/sections`, { name: 'A' });
    const b6 = await post(director, `/classes/${g6.body.id}/sections`, { name: 'B' });
    const a8 = await post(director, `/classes/${g8.body.id}/sections`, { name: 'A' });
    const maths = await post(director, '/subjects', { name: 'Mathematics' });
    const english = await post(director, '/subjects', { name: 'English' });
    const sections = [a6.body.id, a6.body.id, a6.body.id, b6.body.id, a8.body.id];
    const s: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const st = await post(director, '/students', { admissionNo: `S${suffix}-${i + 1}`, firstName: `Kid${i + 1}`, lastName: 'Rao', gender: 'Male', rollNo: String(i + 1), dateOfBirth: '2013-04-04', sectionId: sections[i] });
      s.push(st.body.id);
    }
    const mk = async (role: string, email: string, first: string) => {
      const u = await invite(director, role, email, first);
      return u;
    };
    const u1 = await mk('Teacher', `t1-${suffix}@example.test`, 'Anil');
    const u2 = await mk('Teacher', `t2-${suffix}@example.test`, 'Beena');
    const u3 = await mk('Teacher', `t3-${suffix}@example.test`, 'Chitra');
    const teacherIds: string[] = [];
    for (const u of [u1, u2, u3]) teacherIds.push((await post(director, '/teachers', { userId: u.userId })).body.id);
    const assign = (t: number, section: string, subject: string) => post(director, `/teachers/${teacherIds[t]}/assignments`, { sectionId: section, subjectId: subject });
    await assign(0, a6.body.id, maths.body.id);
    await assign(1, a6.body.id, english.body.id);
    await assign(1, b6.body.id, maths.body.id);
    await assign(2, a8.body.id, english.body.id);
    await patch(director, `/sections/${a6.body.id}`, { classTeacherId: teacherIds[0] });
    const principal = (await mk('Principal', `principal${suffix}@example.test`, 'Pria')).cookie;

    // parents with portal accounts
    const makeParent = async (studentId: string, email: string, first: string) => {
      const p = await post(director, '/parents', { firstName: first, lastName: 'Rao', phone: '9000000001', email });
      await post(director, `/students/${studentId}/parents`, { parentId: p.body.id, relation: 'Mother', isPrimary: true });
      const inv = await post(director, `/parents/${p.body.id}/invite`, { email });
      await agent().post('/api/v1/auth/accept-invite').set('Origin', WEB_ORIGIN).send({ token: inv.body.inviteToken, password: PASSWORD });
      return { cookie: await loginAs(email), id: p.body.id as string };
    };
    const par = await makeParent(s[0], `parent-a${suffix}@example.test`, 'Meera');
    const par2 = await makeParent(s[4], `parent-b${suffix}@example.test`, 'Nisha');
    return { schoolId, director, principal, t1: u1.cookie, t2: u2.cookie, t3: u3.cookie, teacher: { t1: teacherIds[0], t2: teacherIds[1], t3: teacherIds[2] }, users: { t1: u1.userId, t2: u2.userId, t3: u3.userId }, parent: par.cookie, parent2: par2.cookie, parentId: par.id, yearId: ay.body.id, sec: { a6: a6.body.id, b6: b6.body.id, a8: a8.body.id }, cls: { g6: g6.body.id, g8: g8.body.id }, sub: { maths: maths.body.id, english: english.body.id }, s };
  }

  const todayOf = async (cookie: string) => (await get(cookie, '/attendance/today')).body.today as string;
  const shift = (iso: string, days: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
  const weekday = (iso: string) => ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

  // ===========================================================================================

  describe('What a teacher can and cannot reach', () => {
    it('can reach their own workspace', async () => {
      const w = await world();
      for (const url of ['/teaching/dashboard', '/timetable/today', '/homework', '/assignments', '/content', '/exams', '/exams/papers/mine', '/messages', '/leave/mine', '/events', '/notices', '/attendance/corrections']) {
        const res = await get(w.t1, url);
        expect([url, res.status]).toEqual([url, 200]);
      }
    });

    it('has no access to finance, administration, HR or other staff', async () => {
      const w = await world();
      for (const url of ['/fees/outstanding', '/fee-structures', '/payments', '/refunds', '/concessions', '/finance/dashboard', '/receipts/x', '/roles', '/memberships', '/teachers', '/audit-logs', '/reports/students', '/leave', '/finance/audit']) {
        const res = await get(w.t1, url);
        expect([url, res.status]).toEqual([url, 403]);
      }
      expect((await patch(w.t1, '/school-settings', { schoolStartTime: '08:00' })).status).toBe(403);
      expect((await del(w.t1, `/students/${w.s[0]}`)).status).toBe(403);
      expect((await patch(w.t1, `/students/${w.s[0]}`, { sectionId: w.sec.a8 })).status).toBe(403);
      expect((await patch(w.t1, `/students/${w.s[0]}`, { rollNo: '99' })).status).toBe(403);
      expect((await post(w.t1, '/students', { admissionNo: 'X', firstName: 'a', lastName: 'b' })).status).toBe(403);
      expect((await post(w.t1, '/memberships/invitations', { email: 'x@example.test', firstName: 'x', lastName: 'y', roleId: 'z' })).status).toBe(403);
      expect((await post(w.t1, '/timetable', { sectionId: w.sec.a6, subjectId: w.sub.maths, teacherId: w.teacher.t1, dayOfWeek: 1, period: 1, startTime: '09:00', endTime: '09:40' })).status).toBe(403);
      expect((await post(w.t1, '/exams', { name: 'Mid', academicYearId: w.yearId, startDate: '2026-01-01', endDate: '2026-01-05' })).status).toBe(403);
      expect((await post(w.t1, '/events', { title: 'Fair', startDate: '2026-01-01' })).status).toBe(403);
      expect((await patch(w.t1, '/me/profile', { firstName: 'Anil', lastName: 'Test' })).status).toBe(200); // own profile is theirs
    });

    it('sees only the students of the sections they teach', async () => {
      const w = await world();
      const ids = async (cookie: string) => (await get(cookie, '/students')).body.map((x: { id: string }) => x.id).sort();
      expect(await ids(w.t1)).toEqual([w.s[0], w.s[1], w.s[2]].sort()); // 6A
      expect(await ids(w.t2)).toEqual([w.s[0], w.s[1], w.s[2], w.s[3]].sort()); // 6A + 6B
      expect(await ids(w.t3)).toEqual([w.s[4]]); // 8A
      expect((await get(w.t1, `/students/${w.s[0]}`)).status).toBe(200);
      expect((await get(w.t1, `/students/${w.s[4]}`)).status).toBe(404);
      expect((await get(w.t3, `/students/${w.s[0]}`)).status).toBe(404);
    });

    it('keeps teaching Maths in 6A from opening English in 8A', async () => {
      const w = await world();
      // t1 teaches Maths in 6A only: no other section, and no other subject in their own section.
      expect((await get(w.t1, `/attendance?sectionId=${w.sec.a8}&date=2026-01-01`)).status).toBe(404);
      expect((await get(w.t1, `/timetable?sectionId=${w.sec.a8}`)).status).toBe(404);
      expect((await post(w.t1, '/homework', { kind: 'HOMEWORK', sectionIds: [w.sec.a6], subjectId: w.sub.english, title: 'Poem', dueDate: shift(await todayOf(w.t1), 3) })).status).toBe(404);
      expect((await post(w.t1, '/homework', { kind: 'HOMEWORK', sectionIds: [w.sec.a8], subjectId: w.sub.maths, title: 'Sums', dueDate: shift(await todayOf(w.t1), 3) })).status).toBe(404);
      expect((await get(w.t1, `/remarks?studentId=${w.s[4]}`)).status).toBe(404);
      expect((await get(w.t1, `/results/students/${w.s[4]}`)).status).toBe(404);
    });
  });

  describe('Student access policy', () => {
    it('shows the parent’s name but not their contact, unless the school allows it', async () => {
      const w = await world();
      const hidden = await get(w.t1, `/students/${w.s[0]}`);
      expect(hidden.body.parents[0].parent).toMatchObject({ firstName: 'Meera', phone: null, email: null });
      expect(hidden.body.rollNo).toBe('1');
      expect((await patch(w.director, '/school-settings', { teachersSeeParentContact: true })).status).toBe(200);
      const shown = await get(w.t1, `/students/${w.s[0]}`);
      expect(shown.body.parents[0].parent.phone).toBe('9000000001');
      // The principal and the parent themselves always see it.
      expect((await get(w.principal, `/students/${w.s[0]}`)).body.parents[0].parent.phone).toBe('9000000001');
    });

    it('opens only the document categories the school permits, and only for their own students', async () => {
      const w = await world();
      const upload = (studentId: string, category: string) => agent().post(`/api/v1/students/${studentId}/documents`).set('Origin', WEB_ORIGIN).set('Cookie', w.director).field('category', category).attach('file', PDF, { filename: 'doc.pdf', contentType: 'application/pdf' });
      const medical = await upload(w.s[0], 'Medical record');
      const cert = await upload(w.s[0], 'Certificate');
      const other = await upload(w.s[4], 'Certificate');
      expect((await get(w.t1, `/students/${w.s[0]}/documents`)).body).toEqual([]); // nothing permitted by default
      expect((await get(w.t1, `/documents/${cert.body.id}/download`)).status).toBe(404);
      expect((await patch(w.director, '/school-settings', { teacherDocumentCategories: ['Certificate'] })).status).toBe(200);
      const list = await get(w.t1, `/students/${w.s[0]}/documents`);
      expect(list.body.map((d: { id: string }) => d.id)).toEqual([cert.body.id]);
      expect((await get(w.t1, `/documents/${cert.body.id}/download`)).status).toBe(200);
      expect((await get(w.t1, `/documents/${medical.body.id}/download`)).status).toBe(404);
      expect((await get(w.t1, `/documents/${other.body.id}/download`)).status).toBe(404);
      expect((await get(w.t1, `/students/${w.s[4]}/documents`)).status).toBe(404);
      // A teacher can never add or delete student documents.
      expect((await agent().post(`/api/v1/students/${w.s[0]}/documents`).set('Origin', WEB_ORIGIN).set('Cookie', w.t1).attach('file', PDF, { filename: 'x.pdf', contentType: 'application/pdf' })).status).toBe(403);
      expect((await del(w.t1, `/documents/${cert.body.id}`)).status).toBe(403);
    });

    it('refuses a permitted category the school does not use', async () => {
      const w = await world();
      expect((await patch(w.director, '/school-settings', { teacherDocumentCategories: ['Made up'] })).status).toBe(400);
    });
  });

  describe('Attendance', () => {
    it('lets a teacher mark present, absent, late and half day, and records half days', async () => {
      const w = await world();
      const today = await todayOf(w.t1);
      const res = await post(w.t1, '/attendance', { sectionId: w.sec.a6, date: today, records: [{ studentId: w.s[0], status: 'PRESENT' }, { studentId: w.s[1], status: 'HALF_DAY', remarks: 'Left at noon' }, { studentId: w.s[2], status: 'LATE' }] });
      expect(res.status).toBe(201);
      expect(res.body.map((r: { status: string }) => r.status).sort()).toEqual(['HALF_DAY', 'LATE', 'PRESENT']);
      const summary = await get(w.t1, `/attendance/summary?sectionId=${w.sec.a6}&from=${today}&to=${today}`);
      expect(summary.body.find((r: { studentId: string }) => r.studentId === w.s[1])).toMatchObject({ halfDay: 1, total: 1 });
      // Not another class.
      expect((await post(w.t1, '/attendance', { sectionId: w.sec.b6, date: today, records: [{ studentId: w.s[3], status: 'PRESENT' }] })).status).toBe(404);
    });

    it('locks past days; a correction is requested, decided by an administrator, then applied', async () => {
      const w = await world();
      const today = await todayOf(w.t1);
      const yesterday = shift(today, -1);
      // Past days can't be marked or edited directly.
      expect((await post(w.t1, '/attendance', { sectionId: w.sec.a6, date: yesterday, records: [{ studentId: w.s[0], status: 'ABSENT' }] })).status).toBe(400);
      // Today is still editable, so no request is needed.
      const early = await post(w.t1, '/attendance/corrections', { studentId: w.s[0], sectionId: w.sec.a6, date: today, toStatus: 'ABSENT', reason: 'Marked present by mistake' });
      expect(early.status).toBe(400);
      expect(code(early)).toBe('STILL_EDITABLE');

      const req = await post(w.t1, '/attendance/corrections', { studentId: w.s[0], sectionId: w.sec.a6, date: yesterday, toStatus: 'ABSENT', reason: 'He was ill — the register was missed' });
      expect(req.status).toBe(201);
      expect(req.body).toMatchObject({ status: 'REQUESTED', toStatus: 'ABSENT', fromStatus: null });
      const dup = await post(w.t1, '/attendance/corrections', { studentId: w.s[0], sectionId: w.sec.a6, date: yesterday, toStatus: 'LATE', reason: 'Second ask for the same day' });
      expect(code(dup)).toBe('ALREADY_REQUESTED');

      // The teacher can't decide it, and the record hasn't moved.
      expect((await post(w.t1, `/attendance/corrections/${req.body.id}/approve`)).status).toBe(403);
      expect(await db.attendance.count()).toBe(0);
      // Someone else must; they need a reason to reject.
      expect((await post(w.principal, `/attendance/corrections/${req.body.id}/reject`, {})).status).toBe(400);
      const approved = await post(w.principal, `/attendance/corrections/${req.body.id}/approve`, { note: 'Confirmed with the parent' });
      expect(approved.status).toBe(201);
      expect(approved.body.status).toBe('APPROVED');
      const record = await db.attendance.findFirstOrThrow({ where: { studentId: w.s[0] } });
      expect(record.status).toBe('ABSENT');
      expect(await db.auditLog.count({ where: { action: 'attendance.correction.approved' } })).toBe(1);
      // The teacher sees their request, and was told.
      expect((await get(w.t1, '/attendance/corrections')).body.data[0].status).toBe('APPROVED');
      expect(JSON.stringify((await get(w.t1, '/notifications')).body)).toContain('Attendance correction approved');
    });

    it('does not let a teacher ask about another class', async () => {
      const w = await world();
      const yesterday = shift(await todayOf(w.t1), -1);
      expect((await post(w.t1, '/attendance/corrections', { studentId: w.s[4], sectionId: w.sec.a8, date: yesterday, toStatus: 'ABSENT', reason: 'Trying someone else’s class' })).status).toBe(404);
    });
  });

  describe('Timetable and cover', () => {
    const slot = (w: World, extra: object = {}) => ({ sectionId: w.sec.a6, subjectId: w.sub.maths, teacherId: w.teacher.t1, dayOfWeek: 1, period: 1, startTime: '09:00', endTime: '09:40', room: 'R-12', ...extra });

    it('is built by the academic office, from real assignments, without clashes', async () => {
      const w = await world();
      expect((await post(w.director, '/timetable', slot(w, { teacherId: w.teacher.t3 }))).status).toBe(400); // t3 isn't assigned there
      const ok = await post(w.director, '/timetable', slot(w));
      expect(ok.status).toBe(201);
      const sectionBusy = await post(w.director, '/timetable', slot(w, { subjectId: w.sub.english, teacherId: w.teacher.t2 }));
      expect(code(sectionBusy)).toBe('TIMETABLE_CONFLICT');
      const teacherBusy = await post(w.director, '/timetable', slot(w, { sectionId: w.sec.b6, subjectId: w.sub.maths, teacherId: w.teacher.t1 }));
      expect(teacherBusy.status).toBe(400); // t1 doesn't teach 6B at all
      expect((await post(w.director, '/timetable', slot(w, { endTime: '08:00' }))).status).toBe(400);
      expect(JSON.stringify((await get(w.t1, '/notifications')).body)).toContain('Timetable changed');
    });

    it('shows a teacher their own day and their classes, and nobody else’s', async () => {
      const w = await world();
      const today = await todayOf(w.t1);
      await post(w.director, '/timetable', slot(w, { dayOfWeek: weekday(today) }));
      await post(w.director, '/timetable', slot(w, { sectionId: w.sec.a6, subjectId: w.sub.english, teacherId: w.teacher.t2, dayOfWeek: weekday(today), period: 2, startTime: '09:45', endTime: '10:25' }));
      const mine = await get(w.t1, '/timetable/today');
      expect(mine.body.lessons).toHaveLength(1);
      expect(mine.body.lessons[0]).toMatchObject({ kind: 'OWN', period: 1, room: 'R-12', subject: { name: 'Mathematics' } });
      // Class timetable for an assigned class shows every lesson there; another class is closed.
      expect((await get(w.t1, `/timetable?sectionId=${w.sec.a6}`)).body).toHaveLength(2);
      expect((await get(w.t1, `/timetable?sectionId=${w.sec.a8}`)).status).toBe(404);
      expect((await get(w.t3, '/timetable/today')).body.lessons).toEqual([]);
    });

    it('applies a substitute for one day, to both teachers, and tells them', async () => {
      const w = await world();
      const today = await todayOf(w.t1);
      const created = await post(w.director, '/timetable', slot(w, { dayOfWeek: weekday(today) }));
      const sub = await post(w.director, '/timetable/substitutions', { slotId: created.body.id, date: today, substituteTeacherId: w.teacher.t3, reason: 'On leave' });
      expect(sub.status).toBe(201);
      expect((await get(w.t1, '/timetable/today')).body.lessons[0]).toMatchObject({ kind: 'COVERED' });
      expect((await get(w.t3, '/timetable/today')).body.lessons[0]).toMatchObject({ kind: 'COVER', otherTeacher: expect.stringContaining('Anil') });
      expect((await get(w.t2, '/timetable/today')).body.lessons).toEqual([]);
      expect(JSON.stringify((await get(w.t3, '/notifications')).body)).toContain('You are covering a lesson');
      expect((await post(w.director, '/timetable/substitutions', { slotId: created.body.id, date: today, substituteTeacherId: w.teacher.t2 })).status).toBe(409);
      // Cover can't be set for the wrong weekday, or by a teacher.
      expect((await post(w.director, '/timetable/substitutions', { slotId: created.body.id, date: shift(today, 1), substituteTeacherId: w.teacher.t2 })).status).toBe(400);
      expect((await post(w.t1, '/timetable/substitutions', { slotId: created.body.id, date: today, substituteTeacherId: w.teacher.t2 })).status).toBe(403);
    });
  });

  describe('Homework and assignments', () => {
    const due = async (w: World, days = 3) => shift(await todayOf(w.t1), days);

    it('sets homework for a section, tells the parents, and keeps it to the teacher’s own subject', async () => {
      const w = await world();
      const res = await post(w.t1, '/homework', { kind: 'HOMEWORK', sectionIds: [w.sec.a6], subjectId: w.sub.maths, title: 'Exercise 4.1', description: 'Chapter 4', dueDate: await due(w), priority: 'HIGH' });
      expect(res.status).toBe(201);
      expect(res.body[0]).toMatchObject({ kind: 'HOMEWORK', title: 'Exercise 4.1', priority: 'HIGH', section: { name: 'Grade 6 – A' }, wholeSection: true });
      expect(JSON.stringify((await get(w.parent, '/notifications')).body)).toContain('Homework: Exercise 4.1');
      expect(JSON.stringify((await get(w.parent2, '/notifications')).body)).not.toContain('Exercise 4.1'); // another class
      // Homework isn't marked; a bad title is refused.
      expect((await post(w.t1, '/homework', { kind: 'HOMEWORK', sectionIds: [w.sec.a6], subjectId: w.sub.maths, title: 'Marked?', dueDate: await due(w), maxMarks: 10 })).status).toBe(400);
      expect((await post(w.t1, '/homework', { kind: 'HOMEWORK', sectionIds: [w.sec.a6], subjectId: w.sub.maths, title: 'x', dueDate: await due(w) })).status).toBe(400);
    });

    it('sets work for many sections at once, or for particular students', async () => {
      const w = await world();
      const two = await post(w.t2, '/homework', { kind: 'HOMEWORK', sectionIds: [w.sec.b6], subjectId: w.sub.maths, title: 'Fractions', dueDate: await due(w) });
      expect(two.body).toHaveLength(1);
      const some = await post(w.t1, '/homework', { kind: 'HOMEWORK', sectionIds: [w.sec.a6], subjectId: w.sub.maths, title: 'Catch-up', dueDate: await due(w), studentIds: [w.s[1]] });
      expect(some.body[0]).toMatchObject({ wholeSection: false, studentCount: 1 });
      const detail = await get(w.t1, `/homework/${some.body[0].id}`);
      expect(detail.body.roster.map((r: { studentId: string }) => r.studentId)).toEqual([w.s[1]]);
      expect((await post(w.t1, '/homework', { kind: 'HOMEWORK', sectionIds: [w.sec.a6], subjectId: w.sub.maths, title: 'Wrong kid', dueDate: await due(w), studentIds: [w.s[4]] })).status).toBe(400);
    });

    it('records submissions, reviews them with remarks, and shows parents only their own child', async () => {
      const w = await world();
      const hw = (await post(w.t1, '/homework', { kind: 'HOMEWORK', sectionIds: [w.sec.a6], subjectId: w.sub.maths, title: 'Exercise 4.1', dueDate: await due(w) })).body[0];
      const saved = await post(w.t1, `/homework/${hw.id}/submissions`, { records: [{ studentId: w.s[0], status: 'REVIEWED', feedback: 'Neat work' }, { studentId: w.s[1], status: 'SUBMITTED' }, { studentId: w.s[2], status: 'RESUBMIT', feedback: 'Show your steps' }] });
      expect(saved.status).toBe(201);
      expect(saved.body.roster.find((r: { studentId: string }) => r.studentId === w.s[0])).toMatchObject({ status: 'REVIEWED', feedback: 'Neat work' });
      const list = await get(w.t1, '/homework');
      expect(list.body.data[0].progress).toMatchObject({ students: 3, submitted: 2, toReview: 1, reviewed: 1, resubmit: 1 });
      expect(JSON.stringify((await get(w.parent, '/notifications')).body)).toContain('Homework reviewed: Exercise 4.1');
      // The parent sees the class's homework, with their own child's status — and no classmates.
      const asParent = await get(w.parent, `/homework/${hw.id}`);
      expect(asParent.status).toBe(200);
      expect(asParent.body.roster).toHaveLength(1);
      expect(asParent.body.roster[0].studentId).toBe(w.s[0]);
      expect((await post(w.parent, `/homework/${hw.id}/submissions`, { records: [{ studentId: w.s[0], status: 'REVIEWED' }] })).status).toBe(403);
      expect((await post(w.parent, '/homework', { kind: 'HOMEWORK', sectionIds: [w.sec.a6], subjectId: w.sub.maths, title: 'Parent homework', dueDate: await due(w) })).status).toBe(403);
      // Another class's parent and another teacher can't see it.
      expect((await get(w.parent2, `/homework/${hw.id}`)).status).toBe(404);
      expect((await get(w.t3, `/homework/${hw.id}`)).status).toBe(404);
      expect((await post(w.t3, `/homework/${hw.id}/submissions`, { records: [{ studentId: w.s[0], status: 'REVIEWED' }] })).status).toBe(404);
    });

    it('marks assignments out of their maximum and lets files be attached', async () => {
      const w = await world();
      const as = (await post(w.t1, '/assignments', { kind: 'ASSIGNMENT', sectionIds: [w.sec.a6], subjectId: w.sub.maths, title: 'Project', dueDate: await due(w), maxMarks: 20 })).body[0];
      expect((await post(w.t1, '/homework', { kind: 'ASSIGNMENT', sectionIds: [w.sec.a6], subjectId: w.sub.maths, title: 'Wrong screen', dueDate: await due(w) })).status).toBe(400);
      const over = await post(w.t1, `/assignments/${as.id}/submissions`, { records: [{ studentId: w.s[0], status: 'REVIEWED', marks: 21 }] });
      expect(code(over)).toBe('MARKS_ABOVE_MAXIMUM');
      const ok = await post(w.t1, `/assignments/${as.id}/submissions`, { records: [{ studentId: w.s[0], status: 'REVIEWED', marks: 17.5, feedback: 'Good' }] });
      expect(ok.body.roster[0]).toMatchObject({ marks: 17.5, status: 'REVIEWED' });
      // Homework and assignments are separate lists.
      expect((await get(w.t1, `/homework/${as.id}`)).status).toBe(404);
      // Assignment brief + a scan of a student's work.
      const file = await agent().post(`/api/v1/assignments/${as.id}/files`).set('Origin', WEB_ORIGIN).set('Cookie', w.t1).attach('file', PDF, { filename: 'brief.pdf', contentType: 'application/pdf' });
      expect(file.status).toBe(201);
      const dl = await get(w.t1, `/assignments/${as.id}/files/${file.body.id}`).buffer(true).parse(binary);
      expect(dl.status).toBe(200);
      expect((dl.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      const scan = await agent().post(`/api/v1/assignments/${as.id}/students/${w.s[1]}/files`).set('Origin', WEB_ORIGIN).set('Cookie', w.t1).attach('file', PDF, { filename: 'scan.pdf', contentType: 'application/pdf' });
      expect(scan.status).toBe(201);
      expect((await get(w.t3, `/assignments/${as.id}/files/${file.body.id}`)).status).toBe(404);
      expect((await agent().post(`/api/v1/assignments/${as.id}/files`).set('Origin', WEB_ORIGIN).set('Cookie', w.t1).attach('file', Buffer.from('<script>x</script>'), { filename: 'x.pdf', contentType: 'application/pdf' })).status).toBe(400);
    });

    it('can be changed or cancelled, and the parents are told', async () => {
      const w = await world();
      const hw = (await post(w.t1, '/homework', { kind: 'HOMEWORK', sectionIds: [w.sec.a6], subjectId: w.sub.maths, title: 'Exercise 4.2', dueDate: await due(w) })).body[0];
      expect((await patch(w.t1, `/homework/${hw.id}`, { dueDate: await due(w, 5) })).status).toBe(200);
      expect(JSON.stringify((await get(w.parent, '/notifications')).body)).toContain('date changed');
      expect((await patch(w.t1, `/homework/${hw.id}`, { status: 'CANCELLED' })).body.status).toBe('CANCELLED');
      expect(JSON.stringify((await get(w.parent, '/notifications')).body)).toContain('cancelled');
      expect((await patch(w.t1, `/homework/${hw.id}`, { title: 'Edit after cancel' })).status).toBe(409);
      expect((await get(w.parent, '/homework')).body.data).toHaveLength(0); // families don't see cancelled work
      expect((await patch(w.t3, `/homework/${hw.id}`, { title: 'Not mine' })).status).toBe(404);
    });

    it('is invisible across schools', async () => {
      const a = await world('1');
      const b = await world('2');
      const hw = (await post(a.t1, '/homework', { kind: 'HOMEWORK', sectionIds: [a.sec.a6], subjectId: a.sub.maths, title: 'Mine', dueDate: await due(a) })).body[0];
      expect((await get(b.t1, `/homework/${hw.id}`)).status).toBe(404);
      expect((await get(b.principal, `/homework/${hw.id}`)).status).toBe(404);
      expect((await get(b.t1, '/homework')).body.data).toHaveLength(0);
    });
  });

  describe('Study material', () => {
    it('is drafted, published to the class, archived — and seen only by those it is for', async () => {
      const w = await world();
      const draft = (await post(w.t1, '/content', { sectionIds: [w.sec.a6], subjectId: w.sub.maths, kind: 'LINK', title: 'Fractions explained', url: 'https://example.com/fractions' })).body[0];
      expect(draft.status).toBe('DRAFT');
      expect((await get(w.parent, '/content')).body.data).toHaveLength(0); // drafts stay private
      expect((await get(w.parent, `/content/${draft.id}`)).status).toBe(404);
      expect((await patch(w.t1, `/content/${draft.id}`, { status: 'PUBLISHED' })).body.status).toBe('PUBLISHED');
      expect((await get(w.parent, '/content')).body.data.map((c: { id: string }) => c.id)).toEqual([draft.id]);
      expect(JSON.stringify((await get(w.parent, '/notifications')).body)).toContain('New study material');
      expect((await get(w.parent2, '/content')).body.data).toHaveLength(0);
      expect((await get(w.t3, `/content/${draft.id}`)).status).toBe(404);
      expect((await patch(w.t1, `/content/${draft.id}`, { status: 'ARCHIVED' })).body.status).toBe('ARCHIVED');
      expect((await get(w.t1, '/content')).body.data).toHaveLength(0);
      expect((await get(w.t1, '/content?status=ARCHIVED')).body.data).toHaveLength(1);
    });

    it('only accepts web links, and a subject the teacher teaches', async () => {
      const w = await world();
      expect((await post(w.t1, '/content', { sectionIds: [w.sec.a6], subjectId: w.sub.maths, kind: 'LINK', title: 'Bad link', url: 'javascript:alert(1)' })).status).toBe(400);
      expect((await post(w.t1, '/content', { sectionIds: [w.sec.a6], subjectId: w.sub.english, kind: 'NOTE', title: 'Not my subject' })).status).toBe(404);
      const note = (await post(w.t1, '/content', { sectionIds: [w.sec.a6], subjectId: w.sub.maths, kind: 'NOTE', title: 'Notes', publish: true })).body[0];
      const file = await agent().post(`/api/v1/content/${note.id}/files`).set('Origin', WEB_ORIGIN).set('Cookie', w.t1).attach('file', PDF, { filename: 'notes.pdf', contentType: 'application/pdf' });
      expect(file.status).toBe(201);
      expect((await get(w.parent, `/content/${note.id}/files/${file.body.id}`)).status).toBe(200); // published: the family can download it
      expect((await get(w.parent2, `/content/${note.id}/files/${file.body.id}`)).status).toBe(404);
    });
  });

  describe('Exams and marks', () => {
    async function paper(w: World, extra: { sectionId?: string; subjectId?: string; maxMarks?: number } = {}) {
      const exam = await post(w.director, '/exams', { name: 'Mid-term', academicYearId: w.yearId, ...(() => ({ startDate: '2025-01-01', endDate: '2030-12-31' }))() });
      const p = await post(w.director, `/exams/${exam.body.id}/papers`, { sectionId: extra.sectionId ?? w.sec.a6, subjectId: extra.subjectId ?? w.sub.maths, maxMarks: extra.maxMarks ?? 50, date: '2026-12-01', startTime: '09:00', endTime: '10:00', room: 'Hall 1' });
      return { examId: exam.body.id as string, paperId: p.body.id as string, status: p.status };
    }
    const fill = (w: World, cookie: string, paperId: string, values: number[]) => put(cookie, `/exams/papers/${paperId}/marks`, { records: [w.s[0], w.s[1], w.s[2]].map((studentId, i) => ({ studentId, marks: values[i] })) });

    it('only sets a paper for a subject somebody teaches there', async () => {
      const w = await world();
      const exam = await post(w.director, '/exams', { name: 'Unit test', academicYearId: w.yearId, startDate: '2026-12-01', endDate: '2026-12-05' });
      const bad = await post(w.director, `/exams/${exam.body.id}/papers`, { sectionId: w.sec.a8, subjectId: w.sub.maths });
      expect(code(bad)).toBe('NOT_ASSIGNED');
      expect((await post(w.director, `/exams/${exam.body.id}/papers`, { sectionId: w.sec.a6, subjectId: w.sub.maths, date: '2027-06-01' })).status).toBe(400);
    });

    it('shows a teacher their own exams only', async () => {
      const w = await world();
      await paper(w);
      const mine = await get(w.t1, '/exams');
      expect(mine.body[0].papers).toHaveLength(1);
      expect(mine.body[0].papers[0]).toMatchObject({ subject: { name: 'Mathematics' }, room: 'Hall 1', maxMarks: 50 });
      expect((await get(w.t3, '/exams')).body).toEqual([]);
      expect((await get(w.t2, '/exams/papers/mine')).body).toEqual([]);
    });

    it('goes enter → submit → review → approve → publish, and nobody outside sees it before then', async () => {
      const w = await world();
      const { paperId } = await paper(w);
      expect((await fill(w, w.t1, paperId, [40, 51, 30])).status).toBe(400); // above the maximum
      const incomplete = await put(w.t1, `/exams/papers/${paperId}/marks`, { records: [{ studentId: w.s[0], marks: 40 }] });
      expect(incomplete.status).toBe(200);
      const early = await post(w.t1, `/exams/papers/${paperId}/submit`);
      expect(code(early)).toBe('MARKS_INCOMPLETE');
      expect((await fill(w, w.t1, paperId, [40, 35, 30])).status).toBe(200);
      expect((await put(w.t1, `/exams/papers/${paperId}/marks`, { records: [{ studentId: w.s[0], marks: 10, absent: true }] })).status).toBe(400);
      expect((await post(w.t1, `/exams/papers/${paperId}/submit`)).body.status).toBe('SUBMITTED');

      // Locked: no silent change after submit.
      const locked = await fill(w, w.t1, paperId, [50, 50, 50]);
      expect(locked.status).toBe(409);
      expect(code(locked)).toBe('MARKS_LOCKED');
      // The teacher can't review, approve or publish; another teacher can't see the paper.
      for (const step of ['review', 'approve', 'publish']) expect([step, (await post(w.t1, `/exams/papers/${paperId}/${step}`)).status]).toEqual([step, 403]);
      expect((await get(w.t3, `/exams/papers/${paperId}`)).status).toBe(404);
      // Nothing is a result yet.
      expect((await get(w.parent, `/results/students/${w.s[0]}`)).body.exams).toEqual([]);

      expect((await post(w.principal, `/exams/papers/${paperId}/review`)).body.status).toBe('REVIEWED');
      expect((await post(w.principal, `/exams/papers/${paperId}/approve`)).body.status).toBe('APPROVED');
      expect((await get(w.parent, `/results/students/${w.s[0]}`)).body.exams).toEqual([]); // approved is not yet published
      expect((await post(w.principal, `/exams/papers/${paperId}/publish`)).body.status).toBe('PUBLISHED');

      const result = await get(w.parent, `/results/students/${w.s[0]}`);
      expect(result.body.exams[0].subjects[0]).toMatchObject({ subject: 'Mathematics', marks: 40, maxMarks: 50, percent: 80, passed: true });
      expect(result.body.exams[0]).toMatchObject({ totalMarks: 40, totalMax: 50, percent: 80 });
      expect(JSON.stringify((await get(w.parent, '/notifications')).body)).toContain('Results published');
      // …and only their own child's.
      expect((await get(w.parent, `/results/students/${w.s[1]}`)).status).toBe(404);
      expect((await get(w.parent2, `/results/students/${w.s[0]}`)).status).toBe(404);
      // The teacher sees their student's published result too.
      expect((await get(w.t1, `/results/students/${w.s[0]}`)).status).toBe(200);
      const actions = (await db.auditLog.findMany({ where: { module: 'marks' }, orderBy: { createdAt: 'asc' } })).map((l) => l.action);
      expect(actions).toEqual(['marks.submitted', 'marks.reviewed', 'marks.approved', 'marks.published']);
    });

    it('can be sent back to the teacher with a reason', async () => {
      const w = await world();
      const { paperId } = await paper(w);
      await fill(w, w.t1, paperId, [40, 35, 30]);
      await post(w.t1, `/exams/papers/${paperId}/submit`);
      expect((await post(w.principal, `/exams/papers/${paperId}/return`, {})).status).toBe(400);
      const back = await post(w.principal, `/exams/papers/${paperId}/return`, { note: 'Recheck Kid2’s paper' });
      expect(back.body).toMatchObject({ status: 'DRAFT', returnNote: 'Recheck Kid2’s paper' });
      expect(JSON.stringify((await get(w.t1, '/notifications')).body)).toContain('Marks sent back');
      expect((await fill(w, w.t1, paperId, [40, 36, 30])).status).toBe(200); // editable again
    });

    it('is corrected only through a request, an approval, and an audited change', async () => {
      const w = await world();
      const { paperId } = await paper(w);
      await fill(w, w.t1, paperId, [40, 35, 30]);
      await post(w.t1, `/exams/papers/${paperId}/submit`);
      await post(w.principal, `/exams/papers/${paperId}/approve`); // a school with no separate coordinator
      await post(w.principal, `/exams/papers/${paperId}/publish`);

      expect((await post(w.t1, `/exams/papers/${paperId}/corrections`, { reason: 'no' })).status).toBe(400); // too short a reason is refused
      const ask = await post(w.t1, `/exams/papers/${paperId}/corrections`, { reason: 'Kid2 was marked 35 instead of 38' });
      expect(ask.status).toBe(201);
      expect(code(await post(w.t1, `/exams/papers/${paperId}/corrections`, { reason: 'Asking a second time' }))).toBe('ALREADY_REQUESTED');
      expect((await fill(w, w.t1, paperId, [40, 38, 30])).status).toBe(409); // still locked until it's approved
      expect((await post(w.t1, `/exams/corrections/${ask.body.id}/approve`)).status).toBe(403);

      expect((await post(w.principal, `/exams/corrections/${ask.body.id}/approve`, { note: 'Checked the script' })).body.status).toBe('APPROVED');
      // Reopened — and no longer a published result while it is.
      expect((await get(w.t1, `/exams/papers/${paperId}`)).body.status).toBe('CORRECTION');
      expect((await get(w.parent, `/results/students/${w.s[0]}`)).body.exams).toEqual([]);
      expect((await fill(w, w.t1, paperId, [40, 38, 30])).status).toBe(200);
      const change = await db.auditLog.findFirstOrThrow({ where: { action: 'marks.changed' } });
      expect(change.metadata).toMatchObject({ studentId: w.s[1], before: { marks: 35 }, after: { marks: 38 } });
      expect(await db.auditLog.count({ where: { action: 'marks.changed' } })).toBe(1); // only what actually changed

      await post(w.t1, `/exams/papers/${paperId}/submit`);
      await post(w.principal, `/exams/papers/${paperId}/approve`);
      await post(w.principal, `/exams/papers/${paperId}/publish`);
      expect((await get(w.parent, `/results/students/${w.s[0]}`)).body.exams).toHaveLength(1);
    });

    it('rejects a correction request with a reason', async () => {
      const w = await world();
      const { paperId } = await paper(w);
      await fill(w, w.t1, paperId, [40, 35, 30]);
      await post(w.t1, `/exams/papers/${paperId}/submit`);
      const ask = await post(w.t1, `/exams/papers/${paperId}/corrections`, { reason: 'Please reopen this paper' });
      expect((await post(w.principal, `/exams/corrections/${ask.body.id}/reject`, { note: 'Marks were checked twice' })).body.status).toBe('REJECTED');
      expect((await get(w.t1, '/exams/papers/' + paperId)).body.status).toBe('SUBMITTED');
      expect((await get(w.t1, '/exams/corrections')).body[0].status).toBe('REJECTED');
    });

    it('keeps a submitter from approving their own marks', async () => {
      const w = await world();
      const { paperId } = await paper(w);
      await fill(w, w.principal, paperId, [40, 35, 30]);
      await post(w.principal, `/exams/papers/${paperId}/submit`);
      const self = await post(w.principal, `/exams/papers/${paperId}/approve`);
      expect(self.status).toBe(403);
      expect(code(self)).toBe('CANNOT_APPROVE_OWN');
      expect((await post(w.director, `/exams/papers/${paperId}/approve`)).body.status).toBe('APPROVED');
    });

    it('works across schools in isolation', async () => {
      const a = await world('1');
      const b = await world('2');
      const { paperId } = await paper(a);
      expect((await get(b.principal, `/exams/papers/${paperId}`)).status).toBe(404);
      expect((await post(b.principal, `/exams/papers/${paperId}/approve`)).status).toBe(404);
    });
  });

  describe('Remarks and observations', () => {
    it('records what a teacher notices, for the student’s own teachers only', async () => {
      const w = await world();
      const made = await post(w.t1, '/remarks', { studentId: w.s[0], kind: 'STRENGTH', body: 'Quick with mental maths', subjectId: w.sub.maths });
      expect(made.status).toBe(201);
      const list = await get(w.t1, `/remarks?studentId=${w.s[0]}`);
      expect(list.body[0]).toMatchObject({ kind: 'STRENGTH', body: 'Quick with mental maths', subject: 'Mathematics', mine: true, visibleToParents: false });
      // Another teacher of the same class sees it, one from another class can't.
      expect((await get(w.t2, `/remarks?studentId=${w.s[0]}`)).body).toHaveLength(1);
      expect((await get(w.t3, `/remarks?studentId=${w.s[0]}`)).status).toBe(404);
      expect((await post(w.t3, '/remarks', { studentId: w.s[0], body: 'Not my student' })).status).toBe(404);
      // Only the author edits.
      expect((await patch(w.t2, `/remarks/${made.body.id}`, { body: 'Changed by someone else' })).status).toBe(403);
      expect((await patch(w.t1, `/remarks/${made.body.id}`, { body: 'Excellent mental maths' })).status).toBe(200);
      expect((await del(w.t1, `/remarks/${made.body.id}`)).status).toBe(200);
      expect((await get(w.t1, `/remarks?studentId=${w.s[0]}`)).body).toEqual([]);
    });

    it('shows parents a remark only when the school’s policy (or the teacher) says so', async () => {
      const w = await world();
      await post(w.t1, '/remarks', { studentId: w.s[0], body: 'Private teacher note' });
      expect((await get(w.parent, `/remarks?studentId=${w.s[0]}`)).body).toEqual([]);
      await post(w.t1, '/remarks', { studentId: w.s[0], body: 'Shared with the family', visibleToParents: true });
      const seen = await get(w.parent, `/remarks?studentId=${w.s[0]}`);
      expect(seen.body.map((r: { body: string }) => r.body)).toEqual(['Shared with the family']);
      expect(JSON.stringify((await get(w.parent, '/notifications')).body)).toContain('A note about Kid1');
      await patch(w.director, '/school-settings', { shareRemarksWithParents: true });
      await post(w.t1, '/remarks', { studentId: w.s[0], body: 'Shared by the default policy' });
      expect((await get(w.parent, `/remarks?studentId=${w.s[0]}`)).body).toHaveLength(2);
      expect((await get(w.parent2, `/remarks?studentId=${w.s[0]}`)).status).toBe(404);
      expect((await post(w.parent, '/remarks', { studentId: w.s[0], body: 'Parents can’t write remarks' })).status).toBe(403);
    });
  });

  describe('Messages between teachers and parents', () => {
    it('sends to a class, keeps phone numbers out, and stays within the teacher’s own classes', async () => {
      const w = await world();
      const sent = await post(w.t1, '/messages', { kind: 'ANNOUNCEMENT', sectionId: w.sec.a6, subject: 'Maths test', body: 'Tomorrow’s Mathematics class starts at 10:00 AM.' });
      expect(sent.status).toBe(201);
      expect(sent.body.delivered).toBe(1);
      const inbox = await get(w.parent, '/messages');
      expect(inbox.body.data[0]).toMatchObject({ subject: 'Maths test', unread: true, sender: expect.stringContaining('Anil') });
      expect((await get(w.parent, '/messages/unread-count')).body.unread).toBe(1);
      expect(JSON.stringify((await get(w.parent, '/notifications')).body)).toContain('Maths test');
      expect((await get(w.parent2, '/messages')).body.data).toEqual([]);
      const read = await get(w.parent, `/messages/${inbox.body.data[0].id}`);
      expect(read.body.messages[0].body).toContain('10:00 AM');
      expect((await get(w.parent, '/messages/unread-count')).body.unread).toBe(0);
      // Not another class, not another teacher's student, not a parent.
      expect((await post(w.t1, '/messages', { kind: 'ANNOUNCEMENT', sectionId: w.sec.a8, subject: 'Hello', body: 'Wrong class' })).status).toBe(404);
      expect((await post(w.t3, '/messages', { kind: 'STUDENT', studentId: w.s[0], subject: 'Hello', body: 'Not my student' })).status).toBe(404);
      expect((await post(w.parent, '/messages', { kind: 'ANNOUNCEMENT', sectionId: w.sec.a6, subject: 'Hello', body: 'Parents write via “ask a teacher”' })).status).toBe(403);
      expect((await post(w.t1, '/messages', { kind: 'HOMEWORK', sectionId: w.sec.a6, subject: 'Homework', body: 'Missing subject' })).status).toBe(400);
      expect((await post(w.t1, '/messages', { kind: 'HOMEWORK', sectionId: w.sec.a6, subjectId: w.sub.english, subject: 'Homework', body: 'Not their subject' })).status).toBe(404);
    });

    it('lets a parent ask their child’s teachers and get a private reply', async () => {
      const w = await world();
      const ask = await post(w.parent, '/messages/query', { studentId: w.s[0], subject: 'Extra help', body: 'Can Kid1 get help with fractions?' });
      expect(ask.status).toBe(201);
      expect(ask.body.sentTo).toBe(2); // class teacher (Maths) and the English teacher of 6A
      expect((await get(w.t1, '/messages')).body.data[0]).toMatchObject({ kind: 'QUERY', subject: 'Extra help', student: 'Kid1 Rao' });
      expect((await get(w.t3, '/messages')).body.data).toEqual([]);
      const reply = await post(w.t1, `/messages/${ask.body.id}/reply`, { body: 'Yes — stay after class on Thursday.' });
      expect(reply.status).toBe(201);
      const thread = await get(w.parent, `/messages/${ask.body.id}`);
      expect(thread.body.messages.map((m: { body: string }) => m.body)).toEqual(['Can Kid1 get help with fractions?', 'Yes — stay after class on Thursday.']);
      // Strangers can't read or answer the conversation; neither can the other teacher see t1's reply.
      expect((await get(w.parent2, `/messages/${ask.body.id}`)).status).toBe(404);
      expect((await get(w.t3, `/messages/${ask.body.id}`)).status).toBe(404);
      expect((await post(w.parent2, `/messages/${ask.body.id}/reply`, { body: 'Hello' })).status).toBe(404);
      const other = await get(w.t2, `/messages/${ask.body.id}`);
      expect(other.body.messages.map((m: { body: string }) => m.body)).toEqual(['Can Kid1 get help with fractions?']);
      // Another family's child, or a teacher using the parent door, is refused.
      expect((await post(w.parent, '/messages/query', { studentId: w.s[4], subject: 'Hello', body: 'Someone else’s child' })).status).toBe(404);
      expect((await post(w.t1, '/messages/query', { studentId: w.s[0], subject: 'Hello', body: 'Teachers use send' })).status).toBe(403);
    });
  });

  describe('Class announcements', () => {
    it('lets a teacher announce to their own class — and only to it', async () => {
      const w = await world();
      const own = await post(w.t1, '/notices', { title: 'Parents’ evening', body: 'Thursday 5 PM', audienceType: 'SECTION', audienceRefId: w.sec.a6 });
      expect(own.status).toBe(201);
      expect((await post(w.t1, `/notices/${own.body.id}/publish`)).status).toBe(200);
      for (const bad of [{ audienceType: 'ALL_SCHOOL' }, { audienceType: 'SECTION', audienceRefId: w.sec.a8 }, { audienceType: 'CLASS', audienceRefId: w.cls.g8 }, { audienceType: 'INDIVIDUAL', audienceRefId: w.users.t2 }]) {
        const res = await post(w.t1, '/notices', { title: 'No', body: 'No', ...bad });
        expect([JSON.stringify(bad), res.status]).toEqual([JSON.stringify(bad), 403]);
      }
      // 6A's parent hears it; 8A's doesn't; the whole school isn't spammed.
      expect(JSON.stringify((await get(w.parent, '/notifications')).body)).toContain('Parents’ evening');
      expect(JSON.stringify((await get(w.parent2, '/notifications')).body)).not.toContain('Parents’ evening');
      expect((await get(w.parent, '/notices')).body.map((n: { title: string }) => n.title)).toContain('Parents’ evening');
      expect((await get(w.parent2, '/notices')).body.map((n: { title: string }) => n.title)).not.toContain('Parents’ evening');
      expect((await get(w.t3, '/notices')).body.map((n: { title: string }) => n.title)).not.toContain('Parents’ evening');
      expect((await get(w.t2, '/notices')).body.map((n: { title: string }) => n.title)).toContain('Parents’ evening'); // t2 teaches 6A too
    });

    it('keeps other people’s drafts private, and a teacher can’t publish someone else’s notice', async () => {
      const w = await world();
      const draft = await post(w.director, '/notices', { title: 'Staff only draft', body: '…', audienceType: 'ALL_SCHOOL' });
      expect((await get(w.t1, '/notices')).body.map((n: { id: string }) => n.id)).not.toContain(draft.body.id);
      expect((await post(w.t1, `/notices/${draft.body.id}/publish`)).status).toBe(404);
      const mine = await post(w.t1, '/notices', { title: 'My draft', body: '…', audienceType: 'SECTION', audienceRefId: w.sec.a6 });
      expect((await get(w.t1, '/notices')).body.map((n: { id: string }) => n.id)).toContain(mine.body.id);
      expect((await get(w.parent, '/notices')).body.map((n: { id: string }) => n.id)).not.toContain(mine.body.id);
      expect((await post(w.t2, `/notices/${mine.body.id}/publish`)).status).toBe(404);
    });

    it('publishes by itself at the scheduled time', async () => {
      const w = await world();
      const when = new Date(Date.now() + 3_600_000).toISOString();
      const scheduled = await post(w.t1, '/notices', { title: 'Tomorrow’s test', body: 'Chapter 4', audienceType: 'SECTION', audienceRefId: w.sec.a6, scheduledFor: when });
      expect(scheduled.status).toBe(201);
      expect(scheduled.body.publishedAt).toBeNull();
      expect((await post(w.t1, '/notices', { title: 'Past', body: '…', audienceType: 'SECTION', audienceRefId: w.sec.a6, scheduledFor: new Date(Date.now() - 60_000).toISOString() })).status).toBe(400);
      const notices = app.get(NoticesService);
      expect(await notices.publishDue(new Date())).toBe(0); // not yet
      expect((await get(w.parent, '/notices')).body).toEqual([]);
      expect(await notices.publishDue(new Date(Date.now() + 2 * 3_600_000))).toBe(1);
      expect(await notices.publishDue(new Date(Date.now() + 2 * 3_600_000))).toBe(0); // only once
      expect((await get(w.parent, '/notices')).body[0].title).toBe('Tomorrow’s test');
      expect(JSON.stringify((await get(w.parent, '/notifications')).body)).toContain('Tomorrow’s test');
    });
  });

  describe('Leave', () => {
    const next = async (w: World, days: number) => shift(await todayOf(w.t1), days);

    it('applies, shows the balance, and is decided by someone else', async () => {
      const w = await world();
      const day = await next(w, 10);
      const applied = await post(w.t1, '/leave', { kind: 'CASUAL', startDate: day, endDate: day, reason: 'Family function' });
      expect(applied.status).toBe(201);
      expect(applied.body).toMatchObject({ status: 'PENDING', days: 1 });
      const mine = await get(w.t1, '/leave/mine');
      expect(mine.body.balances.find((b: { kind: string }) => b.kind === 'CASUAL')).toMatchObject({ allowance: 12, used: 0, pending: 1, remaining: 11 });
      expect(JSON.stringify((await get(w.principal, '/notifications')).body)).toContain('Leave request');
      expect((await post(w.t1, `/leave/${applied.body.id}/approve`)).status).toBe(403); // no approve permission
      expect((await get(w.t1, '/leave')).status).toBe(403); // can't browse everyone's leave
      const approved = await post(w.principal, `/leave/${applied.body.id}/approve`, { note: 'Enjoy' });
      expect(approved.body.status).toBe('APPROVED');
      expect(JSON.stringify((await get(w.t1, '/notifications')).body)).toContain('Leave approved');
      expect((await get(w.t1, '/leave/mine')).body.balances.find((b: { kind: string }) => b.kind === 'CASUAL')).toMatchObject({ used: 1, pending: 0, remaining: 11 });
      expect((await get(w.principal, '/leave?status=APPROVED')).body.data).toHaveLength(1);
    });

    it('counts only teaching days, refuses overlaps and overspending, and lets a pending request be cancelled', async () => {
      const w = await world();
      await patch(w.director, '/school-settings', { workingDays: [1, 2, 3, 4, 5], leaveAllowances: { CASUAL: 2, SICK: 10, EARNED: 15 } });
      // Find the coming Saturday and Sunday: nothing to take leave for.
      let sat = await next(w, 1);
      while (weekday(sat) !== 6) sat = shift(sat, 1);
      const none = await post(w.t1, '/leave', { kind: 'CASUAL', startDate: sat, endDate: shift(sat, 1), reason: 'Just the weekend' });
      expect(code(none)).toBe('NO_WORKING_DAYS');
      // A full week is five teaching days — more than the two casual days allowed.
      let mon = await next(w, 8);
      while (weekday(mon) !== 1) mon = shift(mon, 1);
      const over = await post(w.t1, '/leave', { kind: 'CASUAL', startDate: mon, endDate: shift(mon, 6), reason: 'A whole week away' });
      expect(code(over)).toBe('LEAVE_BALANCE_EXCEEDED');
      const unpaid = await post(w.t1, '/leave', { kind: 'UNPAID', startDate: mon, endDate: shift(mon, 6), reason: 'A whole week away' });
      expect(unpaid.body.days).toBe(5);
      expect(code(await post(w.t1, '/leave', { kind: 'SICK', startDate: shift(mon, 2), endDate: shift(mon, 2), reason: 'Overlapping request' }))).toBe('OVERLAPS');
      expect((await post(w.t1, `/leave/mine/${unpaid.body.id}/cancel`)).status).toBe(201);
      expect((await get(w.t1, '/leave/mine')).body.requests[0].status).toBe('CANCELLED');
      // Half day is one day only.
      expect((await post(w.t1, '/leave', { kind: 'CASUAL', startDate: mon, endDate: shift(mon, 1), halfDay: true, reason: 'Half a day' })).status).toBe(400);
      const half = await post(w.t1, '/leave', { kind: 'CASUAL', startDate: mon, endDate: mon, halfDay: true, reason: 'Half a day' });
      expect(half.body.days).toBe(0.5);
    });

    it('attaches a supporting document, visible to the applicant and to whoever decides', async () => {
      const w = await world();
      const day = await next(w, 12);
      const req = await post(w.t1, '/leave', { kind: 'SICK', startDate: day, endDate: day, reason: 'Fever and a doctor’s note' });
      const file = await agent().post(`/api/v1/leave/mine/${req.body.id}/files`).set('Origin', WEB_ORIGIN).set('Cookie', w.t1).attach('file', PDF, { filename: 'note.pdf', contentType: 'application/pdf' });
      expect(file.status).toBe(201);
      expect((await get(w.t1, `/leave/mine/${req.body.id}/files/${file.body.id}`)).status).toBe(200);
      expect((await get(w.principal, `/leave/${req.body.id}/files/${file.body.id}`)).status).toBe(200);
      expect((await get(w.t2, `/leave/mine/${req.body.id}/files/${file.body.id}`)).status).toBe(404);
      expect((await get(w.t2, `/leave/${req.body.id}/files/${file.body.id}`)).status).toBe(403);
      // The applicant can list their own attachments; nobody else can list them through that route.
      const mine = await get(w.t1, `/leave/mine/${req.body.id}/files`);
      expect(mine.status).toBe(200);
      expect(mine.body).toHaveLength(1);
      expect((await get(w.t2, `/leave/mine/${req.body.id}/files`)).status).toBe(404);
    });

    it('never lets anyone decide their own leave', async () => {
      const w = await world();
      const day = await next(w, 15);
      const req = await post(w.principal, '/leave', { kind: 'CASUAL', startDate: day, endDate: day, reason: 'Principal on leave' });
      const own = await post(w.principal, `/leave/${req.body.id}/approve`);
      expect(own.status).toBe(403);
      expect(code(own)).toBe('CANNOT_APPROVE_OWN');
      expect((await post(w.director, `/leave/${req.body.id}/reject`, {})).status).toBe(400); // a reason is needed
      expect((await post(w.director, `/leave/${req.body.id}/reject`, { note: 'Exams that week' })).body.status).toBe('REJECTED');
    });

    it('stays inside the school', async () => {
      const a = await world('1');
      const b = await world('2');
      const day = await next(a, 10);
      const req = await post(a.t1, '/leave', { kind: 'CASUAL', startDate: day, endDate: day, reason: 'Private reasons' });
      expect((await post(b.principal, `/leave/${req.body.id}/approve`)).status).toBe(404);
      expect((await get(b.principal, '/leave')).body.data).toEqual([]);
    });
  });

  describe('Dashboard, calendar and reports', () => {
    it('answers “what do I need to do today?”', async () => {
      const w = await world();
      const today = await todayOf(w.t1);
      await post(w.director, '/timetable', { sectionId: w.sec.a6, subjectId: w.sub.maths, teacherId: w.teacher.t1, dayOfWeek: weekday(today), period: 1, startTime: '00:01', endTime: '23:59', room: 'R-1' });
      await post(w.t1, '/homework', { kind: 'HOMEWORK', sectionIds: [w.sec.a6], subjectId: w.sub.maths, title: 'Due today', dueDate: today });
      const as = (await post(w.t1, '/assignments', { kind: 'ASSIGNMENT', sectionIds: [w.sec.a6], subjectId: w.sub.maths, title: 'Project', dueDate: shift(today, 4), maxMarks: 10 })).body[0];
      await post(w.t1, `/assignments/${as.id}/submissions`, { records: [{ studentId: w.s[0], status: 'SUBMITTED' }, { studentId: w.s[1], status: 'SUBMITTED' }] });
      const exam = await post(w.director, '/exams', { name: 'Unit test', academicYearId: w.yearId, startDate: shift(today, -1), endDate: shift(today, 6) });
      await post(w.director, `/exams/${exam.body.id}/papers`, { sectionId: w.sec.a6, subjectId: w.sub.maths, date: shift(today, 2) });
      await post(w.director, '/events', { kind: 'PARENT_TEACHER', title: 'Parent-teacher meeting', startDate: shift(today, 3) });
      await post(w.parent, '/messages/query', { studentId: w.s[0], subject: 'Hello', body: 'A question' });
      await post(w.t1, '/notices', { title: 'Class notice', body: 'x', audienceType: 'SECTION', audienceRefId: w.sec.a6 }).then((n) => post(w.t1, `/notices/${n.body.id}/publish`));

      const d = await get(w.t1, '/teaching/dashboard');
      expect(d.status).toBe(200);
      expect(d.body.isTeacher).toBe(true);
      expect(d.body.metrics).toMatchObject({ myClasses: 1, myStudents: 3, todayClasses: 1, attendancePending: 1, homeworkPending: 1, marksPending: 1, assignmentsToReview: 2, unreadMessages: 1 });
      expect(d.body.lessons[0]).toMatchObject({ room: 'R-1', kind: 'OWN' });
      expect(d.body.nextLesson.room).toBe('R-1');
      expect(d.body.subjects).toEqual([{ section: expect.objectContaining({ name: 'Grade 6 – A' }), subject: expect.objectContaining({ name: 'Mathematics' }) }]);
      expect(d.body.attendancePending[0].name).toBe('Grade 6 – A');
      expect(d.body.upcomingExams[0]).toMatchObject({ exam: 'Unit test', subject: 'Mathematics' });
      expect(d.body.upcomingEvents.map((e: { title: string }) => e.title)).toContain('Parent-teacher meeting');
      expect(d.body.notices.map((n: { title: string }) => n.title)).toContain('Class notice');
      expect(d.body.leave.balances).toHaveLength(3);

      // After the register is taken, nothing is pending.
      await post(w.t1, '/attendance', { sectionId: w.sec.a6, date: today, records: [{ studentId: w.s[0], status: 'PRESENT' }] });
      expect((await get(w.t1, '/teaching/dashboard')).body.metrics.attendancePending).toBe(0);
      // Another teacher's dashboard is about their classes only.
      const d3 = await get(w.t3, '/teaching/dashboard');
      expect(d3.body.metrics).toMatchObject({ myClasses: 1, myStudents: 1, todayClasses: 0, homeworkPending: 0, assignmentsToReview: 0, marksPending: 0 });
      // The Director has no classes of their own.
      expect((await get(w.director, '/teaching/dashboard')).body.metrics).toMatchObject({ myClasses: 0, todayClasses: 0 });
    });

    it('builds a calendar agenda of my exams, work due, events, holidays and leave', async () => {
      const w = await world();
      const today = await todayOf(w.t1);
      const exam = await post(w.director, '/exams', { name: 'Unit test', academicYearId: w.yearId, startDate: today, endDate: shift(today, 9) });
      await post(w.director, `/exams/${exam.body.id}/papers`, { sectionId: w.sec.a6, subjectId: w.sub.maths, date: shift(today, 2) });
      await post(w.director, `/exams/${exam.body.id}/papers`, { sectionId: w.sec.a8, subjectId: w.sub.english, date: shift(today, 2) });
      await post(w.t1, '/homework', { kind: 'HOMEWORK', sectionIds: [w.sec.a6], subjectId: w.sub.maths, title: 'Exercise', dueDate: shift(today, 1) });
      await post(w.director, '/events', { title: 'Sports day', startDate: shift(today, 4) });
      await post(w.director, '/holidays', { name: 'Founders day', type: 'SCHOOL', startDate: shift(today, 5), endDate: shift(today, 5) });
      await post(w.t1, '/leave', { kind: 'CASUAL', startDate: shift(today, 7), endDate: shift(today, 7), reason: 'Personal work' });
      const agenda = await get(w.t1, `/teaching/agenda?from=${today}&to=${shift(today, 10)}`);
      expect(agenda.status).toBe(200);
      const kinds = agenda.body.map((i: { type: string }) => i.type);
      expect(kinds).toEqual(expect.arrayContaining(['EXAM', 'HOMEWORK_DUE', 'EVENT', 'HOLIDAY', 'LEAVE']));
      expect(kinds.filter((k: string) => k === 'EXAM')).toHaveLength(1); // only their own paper
      expect(agenda.body.map((i: { date: string }) => i.date)).toEqual([...agenda.body.map((i: { date: string }) => i.date)].sort());
      expect((await get(w.t1, '/teaching/agenda?from=2026-02-01&to=2026-01-01')).status).toBe(400);
    });

    it('reports on attendance, completion and marks for the teacher’s own classes, and exports them', async () => {
      const w = await world();
      const today = await todayOf(w.t1);
      await post(w.t1, '/attendance', { sectionId: w.sec.a6, date: today, records: [{ studentId: w.s[0], status: 'PRESENT' }, { studentId: w.s[1], status: 'ABSENT' }, { studentId: w.s[2], status: 'HALF_DAY' }] });
      const hw = (await post(w.t1, '/homework', { kind: 'HOMEWORK', sectionIds: [w.sec.a6], subjectId: w.sub.maths, title: 'Exercise', dueDate: today })).body[0];
      await post(w.t1, `/homework/${hw.id}/submissions`, { records: [{ studentId: w.s[0], status: 'REVIEWED' }, { studentId: w.s[1], status: 'SUBMITTED' }] });
      const exam = await post(w.director, '/exams', { name: 'Unit test', academicYearId: w.yearId, startDate: shift(today, -3), endDate: today });
      const paper = await post(w.director, `/exams/${exam.body.id}/papers`, { sectionId: w.sec.a6, subjectId: w.sub.maths, maxMarks: 50 });
      await put(w.t1, `/exams/papers/${paper.body.id}/marks`, { records: [{ studentId: w.s[0], marks: 45 }, { studentId: w.s[1], marks: 20 }, { studentId: w.s[2], absent: true }] });
      await post(w.t1, `/exams/papers/${paper.body.id}/submit`);
      await post(w.principal, `/exams/papers/${paper.body.id}/approve`);
      await post(w.principal, `/exams/papers/${paper.body.id}/publish`);

      const att = await get(w.t1, '/teaching/reports/class-attendance');
      expect(att.body.rows).toHaveLength(3);
      expect(att.body.rows.find((r: { student: string }) => r.student === 'Kid3 Rao')).toMatchObject({ halfDay: 1, percent: 50 });
      expect(att.body.rows.find((r: { student: string }) => r.student === 'Kid2 Rao')).toMatchObject({ absent: 1, percent: 0 });
      const hwReport = await get(w.t1, '/teaching/reports/homework-completion');
      expect(hwReport.body.rows[0]).toMatchObject({ title: 'Exercise', students: 3, handedIn: 2, reviewed: 1, notYet: 1 });
      const perf = await get(w.t1, '/teaching/reports/student-performance');
      expect(perf.body.rows.find((r: { student: string }) => r.student === 'Kid1 Rao')).toMatchObject({ percent: 90, papers: 1 });
      const exams = await get(w.t1, '/teaching/reports/exam-performance');
      expect(exams.body.rows[0]).toMatchObject({ subject: 'Mathematics', entered: 3, absent: 1, highest: 45, lowest: 20, average: 32.5 });
      const matrix = await get(w.t1, '/teaching/reports/subject-marks');
      expect(matrix.body.columns.map((c: { header: string }) => c.header)).toContain('Mathematics');
      expect((await get(w.t1, '/teaching/reports/class-trends')).body.rows).toHaveLength(1);
      // Contact details follow the school's policy.
      const list = await get(w.t1, '/teaching/reports/student-list');
      expect(list.body.rows).toHaveLength(3);
      expect(list.body.columns.map((c: { key: string }) => c.key)).not.toContain('parentPhone');
      await patch(w.director, '/school-settings', { teachersSeeParentContact: true });
      expect((await get(w.t1, '/teaching/reports/student-list')).body.columns.map((c: { key: string }) => c.key)).toContain('parentPhone');
      // Never another class, never an unknown report.
      expect((await get(w.t1, `/teaching/reports/class-attendance?sectionId=${w.sec.a8}`)).status).toBe(404);
      expect((await get(w.t1, '/teaching/reports/made-up')).status).toBe(400);
      expect((await get(w.t3, '/teaching/reports/student-list')).body.rows).toHaveLength(1);
      expect((await get(w.parent, '/teaching/reports/class-attendance')).status).toBe(403);

      for (const [format, type] of [['csv', 'text/csv'], ['xlsx', 'spreadsheetml'], ['pdf', 'application/pdf']] as const) {
        const file = await get(w.t1, `/teaching/reports/class-attendance/export?format=${format}`).buffer(true).parse(binary);
        expect([format, file.status]).toEqual([format, 200]);
        expect(file.headers['content-type']).toContain(type);
      }
      expect(await db.auditLog.count({ where: { action: 'teaching.export' } })).toBe(3);
      expect((await get(w.t1, '/teaching/reports/class-attendance/export?format=exe')).status).toBe(400);
    });

    it('reports for the whole school to an administrator, but not across schools', async () => {
      const a = await world('1');
      const b = await world('2');
      expect((await get(a.principal, '/teaching/reports/student-list')).body.rows).toHaveLength(5);
      expect((await get(b.principal, '/teaching/reports/student-list')).body.rows).toHaveLength(5);
      expect((await get(b.t1, `/teaching/reports/class-attendance?sectionId=${a.sec.a6}`)).status).toBe(404);
    });
  });

  describe('Events and the academic coordinator', () => {
    it('lets the office add events that every teacher sees', async () => {
      const w = await world();
      const today = await todayOf(w.t1);
      const ev = await post(w.director, '/events', { kind: 'MEETING', title: 'Staff meeting', startDate: shift(today, 1), startTime: '15:00', location: 'Staff room' });
      expect(ev.status).toBe(201);
      expect((await get(w.t3, `/events?from=${today}&to=${shift(today, 5)}`)).body[0]).toMatchObject({ title: 'Staff meeting', kind: 'MEETING', startTime: '15:00' });
      expect((await patch(w.director, `/events/${ev.body.id}`, { title: 'Staff meeting (moved)' })).body.title).toBe('Staff meeting (moved)');
      expect((await del(w.director, `/events/${ev.body.id}`)).status).toBe(200);
      expect((await get(w.t3, '/events')).body).toEqual([]);
    });

    it('gives the coordinator the marks review and the timetable, but not the final approval', async () => {
      const w = await world();
      const coordinator = (await invite(w.director, 'Academic Coordinator', 'coord@example.test', 'Cora')).cookie;
      const exam = await post(w.director, '/exams', { name: 'Unit test', academicYearId: w.yearId, startDate: '2025-01-01', endDate: '2030-12-31' });
      const paper = await post(w.director, `/exams/${exam.body.id}/papers`, { sectionId: w.sec.a6, subjectId: w.sub.maths, maxMarks: 10 });
      await put(w.t1, `/exams/papers/${paper.body.id}/marks`, { records: [w.s[0], w.s[1], w.s[2]].map((studentId) => ({ studentId, marks: 5 })) });
      await post(w.t1, `/exams/papers/${paper.body.id}/submit`);
      expect((await post(coordinator, `/exams/papers/${paper.body.id}/approve`)).status).toBe(403);
      expect((await post(coordinator, `/exams/papers/${paper.body.id}/review`)).body.status).toBe('REVIEWED');
      expect((await post(w.principal, `/exams/papers/${paper.body.id}/approve`)).body.status).toBe('APPROVED');
      expect((await post(coordinator, '/timetable', { sectionId: w.sec.a6, subjectId: w.sub.maths, teacherId: w.teacher.t1, dayOfWeek: 2, period: 3, startTime: '10:00', endTime: '10:40' })).status).toBe(201);
      // …and nothing financial.
      expect((await get(coordinator, '/fees/outstanding')).status).toBe(403);
      expect((await get(coordinator, '/payments')).status).toBe(403);
    });

    it('offers planners the whole school’s classes, subjects and teachers — and nobody else', async () => {
      const w = await world();
      const coordinator = (await invite(w.director, 'Academic Coordinator', 'planner@example.test', 'Pia')).cookie;
      for (const path of ['/exams/options', '/timetable/options']) {
        const res = await get(coordinator, path);
        expect(res.status).toBe(200);
        expect(res.body.sections.length).toBeGreaterThanOrEqual(2);
        expect(res.body.teachers.length).toBeGreaterThanOrEqual(2);
        expect(res.body.assignments.length).toBeGreaterThan(0);
        expect(res.body.academicYears.length).toBeGreaterThan(0);
        expect((await get(w.t1, path)).status).toBe(403);
        expect((await get(w.parent, path)).status).toBe(403);
      }
    });
  });

  describe('Profile photo', () => {
    it('lets a teacher set, see and remove their own photo — checked by content', async () => {
      const w = await world();
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
      const up = await agent().post('/api/v1/me/photo').set('Origin', WEB_ORIGIN).set('Cookie', w.t1).attach('file', png, { filename: 'me.png', contentType: 'image/png' });
      expect(up.status).toBe(201);
      expect((await get(w.t1, '/me/profile')).body.user.photoUrl).toBe('/me/photo');
      const photo = await get(w.t1, '/me/photo').buffer(true).parse(binary);
      expect(photo.status).toBe(200);
      expect(photo.headers['content-type']).toBe('image/png');
      expect((await get(w.t2, '/me/photo')).status).toBe(404); // everyone's photo is their own
      expect((await agent().post('/api/v1/me/photo').set('Origin', WEB_ORIGIN).set('Cookie', w.t1).attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' })).status).toBe(400);
      expect((await del(w.t1, '/me/photo')).status).toBe(200);
      expect((await get(w.t1, '/me/profile')).body.user.photoUrl).toBeNull();
    });
  });
});
