import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { resetTestData } from './db-helpers';
import { permissionCatalog } from '../prisma/seed-data/permissions';
import { currentYearDates } from './year-helpers';

// End-to-end tests for Phase 8 (Attendance): bulk marking, the section
// roster view, corrections, student history, and section summaries — all
// through the real HTTP stack. Attendance deliberately reuses the
// existing 'Section' and 'Student' ResourceType authorization built in
// Phase 4/6 (docs/authorization.md §3) rather than adding a new
// resource type, so these tests double as confirmation that OWN_CLASS
// (via a section) and OWN_CHILDREN (via a student) resolve correctly
// for a module neither scope was originally built against.

const WEB_ORIGIN = 'http://localhost:3000';

// Attendance can only be marked/changed on the day itself, in the school's
// own time zone (the default school zone is Asia/Kolkata). Past days are
// locked even for a Director, so any test that needs *history* has to put
// past rows in directly — the API correctly refuses to create them.
const SCHOOL_TZ = 'Asia/Kolkata';
const isoInZone = (offsetDays = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: SCHOOL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000),
  );
const TODAY = () => isoInZone(0);
const YESTERDAY = () => isoInZone(-1);
const TOMORROW = () => isoInZone(1);

describe('Attendance (e2e)', () => {
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

  // Puts attendance rows straight into the DB (the API refuses past dates).
  async function insertAttendance(
    schoolName: string,
    sectionId: string,
    rows: { studentId: string; date: string; status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' }[],
  ) {
    const school = await seedClient.school.findFirstOrThrow({ where: { name: schoolName } });
    const membership = await seedClient.schoolMembership.findFirstOrThrow({ where: { schoolId: school.id } });
    for (const row of rows) {
      await seedClient.attendance.create({
        data: { schoolId: school.id, sectionId, studentId: row.studentId, date: new Date(row.date), status: row.status, markedById: membership.userId },
      });
    }
  }

  async function registerSchool(schoolName: string, email: string, password = 'correct-horse-battery') {
    const res = await agent()
      .post('/api/v1/schools/register')
      .set('Origin', WEB_ORIGIN)
      .send({ schoolName, directorFirstName: 'D', directorLastName: 'R', email, password });
    return { schoolId: res.body.schoolId as string, cookie: res.headers['set-cookie'] as string };
  }

  async function setUpSection(cookie: string) {
    const ay = await agent()
      .post('/api/v1/academic-years')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({ name: '2025-26', ...currentYearDates() });
    const klass = await agent()
      .post('/api/v1/classes')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({ academicYearId: ay.body.id, name: 'Grade 5', order: 5 });
    const section = await agent()
      .post(`/api/v1/classes/${klass.body.id}/sections`)
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({ name: 'A' });
    return section.body.id as string;
  }

  async function admitStudent(cookie: string, sectionId: string, admissionNo: string) {
    const res = await agent()
      .post('/api/v1/students')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({ admissionNo, firstName: 'Kabir', lastName: 'Rao', sectionId });
    return res.body.id as string;
  }

  async function inviteAndLogin(directorCookie: string, roleName: string, email: string, password: string) {
    const roles = await agent().get('/api/v1/roles').set('Cookie', directorCookie);
    const role = roles.body.find((r: { name: string }) => r.name === roleName);
    const invite = await agent()
      .post('/api/v1/memberships/invitations')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', directorCookie)
      .send({ email, firstName: 'T', lastName: 'R', roleId: role.id });
    await agent()
      .post('/api/v1/auth/accept-invite')
      .set('Origin', WEB_ORIGIN)
      .send({ token: invite.body.inviteToken, password });
    const login = await agent().post('/api/v1/auth/login').set('Origin', WEB_ORIGIN).send({ email, password });
    const cookie = login.headers['set-cookie'] as string;
    // Login does NOT auto-select a school (only registration does,
    // docs/multi-tenancy.md §2) — every school-scoped call after this
    // would otherwise 403 from SchoolContextGuard for having no active
    // school, not from the permission/scope check these tests actually
    // mean to exercise.
    const me = await agent().get('/api/v1/auth/me').set('Cookie', cookie);
    const membershipId = me.body.memberships[0].membershipId;
    await agent()
      .post('/api/v1/auth/select-school')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({ membershipId });
    return { cookie, userId: invite.body.userId as string };
  }

  describe('Marking', () => {
    it('marks attendance for a section and returns the merged roster', async () => {
      const { cookie } = await registerSchool('Attendance School', 'attendance1@example.test');
      const sectionId = await setUpSection(cookie);
      const studentA = await admitStudent(cookie, sectionId, 'A-1');
      const studentB = await admitStudent(cookie, sectionId, 'A-2');

      const mark = await agent()
        .post('/api/v1/attendance')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({
          sectionId,
          date: TODAY(),
          records: [
            { studentId: studentA, status: 'PRESENT' },
            { studentId: studentB, status: 'ABSENT', remarks: 'Sick' },
          ],
        });
      expect(mark.status).toBe(201);
      const byId = Object.fromEntries(mark.body.map((r: { studentId: string; status: string }) => [r.studentId, r]));
      expect(byId[studentA].status).toBe('PRESENT');
      expect(byId[studentB].status).toBe('ABSENT');
      expect(byId[studentB].remarks).toBe('Sick');
    });

    it('shows unmarked students as null on a fresh date', async () => {
      const { cookie } = await registerSchool('Fresh Date School', 'freshdate1@example.test');
      const sectionId = await setUpSection(cookie);
      await admitStudent(cookie, sectionId, 'A-1');

      const roster = await agent()
        .get(`/api/v1/attendance?sectionId=${sectionId}&date=2025-06-02`)
        .set('Cookie', cookie);
      expect(roster.status).toBe(200);
      expect(roster.body).toHaveLength(1);
      expect(roster.body[0].status).toBeNull();
    });

    it('re-marking the same student and date upserts instead of duplicating', async () => {
      const { cookie } = await registerSchool('Upsert School', 'upsert1@example.test');
      const sectionId = await setUpSection(cookie);
      const studentA = await admitStudent(cookie, sectionId, 'A-1');

      await agent()
        .post('/api/v1/attendance')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ sectionId, date: TODAY(), records: [{ studentId: studentA, status: 'ABSENT' }] });
      const second = await agent()
        .post('/api/v1/attendance')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ sectionId, date: TODAY(), records: [{ studentId: studentA, status: 'PRESENT' }] });
      expect(second.status).toBe(201);
      expect(second.body).toHaveLength(1);
      expect(second.body[0].status).toBe('PRESENT');
    });

    it('rejects a student who is not in the given section', async () => {
      const { cookie } = await registerSchool('Wrong Section School', 'wrongsection1@example.test');
      const sectionId = await setUpSection(cookie);
      const otherSectionId = await setUpSection(cookie); // a second, unrelated section
      const outsideStudent = await admitStudent(cookie, otherSectionId, 'B-1');

      const res = await agent()
        .post('/api/v1/attendance')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ sectionId, date: TODAY(), records: [{ studentId: outsideStudent, status: 'PRESENT' }] });
      expect(res.status).toBe(400);
    });

    it('corrects a previously marked record', async () => {
      const { cookie } = await registerSchool('Correction School', 'correction1@example.test');
      const sectionId = await setUpSection(cookie);
      const studentA = await admitStudent(cookie, sectionId, 'A-1');
      const mark = await agent()
        .post('/api/v1/attendance')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ sectionId, date: TODAY(), records: [{ studentId: studentA, status: 'ABSENT' }] });
      const attendanceId = mark.body[0].attendanceId;

      const corrected = await agent()
        .patch(`/api/v1/attendance/${attendanceId}`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ status: 'LATE', remarks: 'Traffic' });
      expect(corrected.status).toBe(200);
      expect(corrected.body.status).toBe('LATE');
      expect(corrected.body.remarks).toBe('Traffic');
    });

    it("a Teacher who is not this section's class teacher cannot mark attendance for it (404)", async () => {
      const { cookie: directorCookie } = await registerSchool('Teacher Perm Attendance', 'teacherpermattendance@example.test');
      const sectionId = await setUpSection(directorCookie);
      const studentA = await admitStudent(directorCookie, sectionId, 'A-1');
      const { cookie: teacherCookie } = await inviteAndLogin(
        directorCookie,
        'Teacher',
        'notmyclass@example.test',
        'teacher-pass-123',
      );

      const res = await agent()
        .post('/api/v1/attendance')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', teacherCookie)
        .send({ sectionId, date: TODAY(), records: [{ studentId: studentA, status: 'PRESENT' }] });
      expect(res.status).toBe(404);
    });

    it("a section's own class teacher CAN mark attendance for it", async () => {
      const { cookie: directorCookie } = await registerSchool('Class Teacher Attendance', 'classteacherattendance@example.test');
      const sectionId = await setUpSection(directorCookie);
      const studentA = await admitStudent(directorCookie, sectionId, 'A-1');
      const { cookie: teacherCookie, userId } = await inviteAndLogin(
        directorCookie,
        'Teacher',
        'myclass@example.test',
        'teacher-pass-123',
      );
      const teacherProfile = await agent()
        .post('/api/v1/teachers')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', directorCookie)
        .send({ userId });
      await agent()
        .patch(`/api/v1/sections/${sectionId}`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', directorCookie)
        .send({ classTeacherId: teacherProfile.body.id });

      const res = await agent()
        .post('/api/v1/attendance')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', teacherCookie)
        .send({ sectionId, date: TODAY(), records: [{ studentId: studentA, status: 'PRESENT' }] });
      expect(res.status).toBe(201);
    });

    it("404s when School B tries to mark attendance for School A's section (cross-tenant)", async () => {
      const schoolA = await registerSchool('School A Attendance', 'schoolA-attendance@example.test');
      const schoolB = await registerSchool('School B Attendance', 'schoolB-attendance@example.test');
      const sectionA = await setUpSection(schoolA.cookie);
      const studentA = await admitStudent(schoolA.cookie, sectionA, 'A-1');

      const res = await agent()
        .post('/api/v1/attendance')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', schoolB.cookie)
        .send({ sectionId: sectionA, date: TODAY(), records: [{ studentId: studentA, status: 'PRESENT' }] });
      expect(res.status).toBe(404);
    });
  });

  describe('History and summary', () => {
    it("returns a student's attendance history within a date range", async () => {
      const { cookie } = await registerSchool('History School', 'history1@example.test');
      const sectionId = await setUpSection(cookie);
      const studentA = await admitStudent(cookie, sectionId, 'A-1');
      await insertAttendance('History School', sectionId, [
        { studentId: studentA, date: '2025-06-10', status: 'PRESENT' },
        { studentId: studentA, date: '2025-06-11', status: 'ABSENT' },
      ]);

      const history = await agent()
        .get(`/api/v1/attendance/history?studentId=${studentA}&from=2025-06-01&to=2025-06-30`)
        .set('Cookie', cookie);
      expect(history.status).toBe(200);
      expect(history.body).toHaveLength(2);
    });

    it('summarizes present/absent/late/excused counts for a section', async () => {
      const { cookie } = await registerSchool('Summary School', 'summary1@example.test');
      const sectionId = await setUpSection(cookie);
      const studentA = await admitStudent(cookie, sectionId, 'A-1');
      await insertAttendance('Summary School', sectionId, [
        { studentId: studentA, date: '2025-06-10', status: 'PRESENT' },
        { studentId: studentA, date: '2025-06-11', status: 'ABSENT' },
        { studentId: studentA, date: '2025-06-12', status: 'PRESENT' },
      ]);

      const summary = await agent()
        .get(`/api/v1/attendance/summary?sectionId=${sectionId}&from=2025-06-01&to=2025-06-30`)
        .set('Cookie', cookie);
      expect(summary.status).toBe(200);
      const row = summary.body.find((r: { studentId: string }) => r.studentId === studentA);
      expect(row.present).toBe(2);
      expect(row.absent).toBe(1);
      expect(row.total).toBe(3);
    });

    it("a parent with OWN_CHILDREN scope can view their own child's attendance history", async () => {
      const { cookie } = await registerSchool('Parent History School', 'parenthistory1@example.test');
      const sectionId = await setUpSection(cookie);
      const studentA = await admitStudent(cookie, sectionId, 'A-1');
      await insertAttendance('Parent History School', sectionId, [{ studentId: studentA, date: '2025-06-10', status: 'PRESENT' }]);

      // Parent onboarding via the portal (linking a login to a Parent
      // profile) is deferred to a later phase — set up the link directly
      // in the DB, as the Phase 4 cross-tenant matrix tests do, to prove
      // the OWN_CHILDREN scope this module reuses actually resolves.
      const prisma = new PrismaClient();
      try {
        const school = await prisma.school.findFirstOrThrow({ where: { name: 'Parent History School' } });
        const role = await prisma.role.findFirstOrThrow({ where: { schoolId: school.id, name: 'Parent' } });
        const password = 'parent-pass-12345';
        const parentUser = await prisma.user.create({
          data: {
            email: 'parentuser@example.test',
            firstName: 'Meera',
            lastName: 'Rao',
            passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
            status: 'ACTIVE',
          },
        });
        const membership = await prisma.schoolMembership.create({
          data: { userId: parentUser.id, schoolId: school.id, roleId: role.id, status: 'ACTIVE' },
        });
        const parentProfile = await prisma.parent.create({
          data: { schoolId: school.id, userId: parentUser.id, firstName: 'Meera', lastName: 'Rao' },
        });
        await prisma.studentParent.create({
          data: { schoolId: school.id, studentId: studentA, parentId: parentProfile.id, relation: 'Mother' },
        });

        const login = await agent()
          .post('/api/v1/auth/login')
          .set('Origin', WEB_ORIGIN)
          .send({ email: 'parentuser@example.test', password });
        const parentCookie = login.headers['set-cookie'] as unknown as string;
        // Login does NOT auto-select a school — see the inviteAndLogin
        // helper's comment above for why this matters.
        await agent()
          .post('/api/v1/auth/select-school')
          .set('Origin', WEB_ORIGIN)
          .set('Cookie', parentCookie)
          .send({ membershipId: membership.id });

        const history = await agent()
          .get(`/api/v1/attendance/history?studentId=${studentA}&from=2025-06-01&to=2025-06-30`)
          .set('Cookie', parentCookie);
        expect(history.status).toBe(200);
        expect(history.body).toHaveLength(1);
      } finally {
        await prisma.$disconnect();
      }
    });
  });

  describe('Past dates are locked', () => {
    async function markOn(cookie: string, sectionId: string, studentId: string, date: string, status = 'PRESENT') {
      return agent()
        .post('/api/v1/attendance')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ sectionId, date, records: [{ studentId, status }] });
    }

    it('marks attendance for today', async () => {
      const { cookie } = await registerSchool('Lock Today School', 'locktoday@example.test');
      const sectionId = await setUpSection(cookie);
      const studentA = await admitStudent(cookie, sectionId, 'A-1');
      const res = await markOn(cookie, sectionId, studentA, TODAY());
      expect(res.status).toBe(201);
    });

    it('rejects marking attendance for a past date, even for the Director', async () => {
      const { cookie } = await registerSchool('Lock Past School', 'lockpast@example.test');
      const sectionId = await setUpSection(cookie);
      const studentA = await admitStudent(cookie, sectionId, 'A-1');

      for (const date of [YESTERDAY(), '2025-06-01']) {
        const res = await markOn(cookie, sectionId, studentA, date);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('ATTENDANCE_LOCKED');
      }
      const roster = await agent().get(`/api/v1/attendance?sectionId=${sectionId}&date=${YESTERDAY()}`).set('Cookie', cookie);
      expect(roster.body[0].status).toBeNull(); // nothing was written
    });

    it('rejects marking attendance in advance', async () => {
      const { cookie } = await registerSchool('Lock Future School', 'lockfuture@example.test');
      const sectionId = await setUpSection(cookie);
      const studentA = await admitStudent(cookie, sectionId, 'A-1');
      const res = await markOn(cookie, sectionId, studentA, TOMORROW());
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ATTENDANCE_LOCKED');
    });

    it('rejects correcting a record once its day has passed, but still lets you read it', async () => {
      const { cookie } = await registerSchool('Lock Correct School', 'lockcorrect@example.test');
      const sectionId = await setUpSection(cookie);
      const studentA = await admitStudent(cookie, sectionId, 'A-1');
      await insertAttendance('Lock Correct School', sectionId, [{ studentId: studentA, date: YESTERDAY(), status: 'ABSENT' }]);

      const roster = await agent().get(`/api/v1/attendance?sectionId=${sectionId}&date=${YESTERDAY()}`).set('Cookie', cookie);
      expect(roster.status).toBe(200);
      expect(roster.body[0].status).toBe('ABSENT');

      const patch = await agent()
        .patch(`/api/v1/attendance/${roster.body[0].attendanceId}`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ status: 'PRESENT' });
      expect(patch.status).toBe(400);
      expect(patch.body.error.code).toBe('ATTENDANCE_LOCKED');

      const after = await agent().get(`/api/v1/attendance?sectionId=${sectionId}&date=${YESTERDAY()}`).set('Cookie', cookie);
      expect(after.body[0].status).toBe('ABSENT');
    });

    it("tells the UI what the school's today is", async () => {
      const { cookie } = await registerSchool('Lock Today Endpoint School', 'locktodayep@example.test');
      const res = await agent().get('/api/v1/attendance/today').set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.today).toBe(TODAY());
    });

    it('rejects a malformed date', async () => {
      const { cookie } = await registerSchool('Lock Format School', 'lockformat@example.test');
      const sectionId = await setUpSection(cookie);
      const studentA = await admitStudent(cookie, sectionId, 'A-1');
      const res = await markOn(cookie, sectionId, studentA, 'yesterday');
      expect(res.status).toBe(400);
    });
  });
});
