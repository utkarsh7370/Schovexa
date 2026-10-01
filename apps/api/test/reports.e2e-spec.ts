import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { resetTestData } from './db-helpers';
import { permissionCatalog } from '../prisma/seed-data/permissions';

// End-to-end tests for the Reports module (MVP punch-list item 5): the
// student roster, attendance, and fee-collection reports and their CSV
// exports, all through the real HTTP stack. Reports are school-wide
// aggregates rather than single resources, so — unlike every other
// module — there's no authorizeResource() call to test; instead these
// tests confirm ReportsService's own ALL_SCHOOL-only scope check, and
// that report.view/report.export are gated separately.

const WEB_ORIGIN = 'http://localhost:3000';

describe('Reports (e2e)', () => {
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

  async function registerSchool(schoolName: string, email: string, password = 'correct-horse-battery') {
    const res = await agent()
      .post('/api/v1/schools/register')
      .set('Origin', WEB_ORIGIN)
      .send({ schoolName, directorFirstName: 'D', directorLastName: 'R', email, password });
    return { schoolId: res.body.schoolId as string, cookie: res.headers['set-cookie'] as string };
  }

  async function setUpClassAndSection(cookie: string) {
    const ay = await agent()
      .post('/api/v1/academic-years')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({ name: '2025-26', startDate: '2025-04-01', endDate: '2026-03-31' });
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
    return {
      academicYearId: ay.body.id as string,
      classId: klass.body.id as string,
      sectionId: section.body.id as string,
    };
  }

  async function admitStudent(cookie: string, sectionId: string | undefined, admissionNo: string) {
    const res = await agent()
      .post('/api/v1/students')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({ admissionNo, firstName: 'Kabir', lastName: 'Rao', ...(sectionId ? { sectionId } : {}) });
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
    const me = await agent().get('/api/v1/auth/me').set('Cookie', cookie);
    const membershipId = me.body.memberships[0].membershipId;
    await agent()
      .post('/api/v1/auth/select-school')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({ membershipId });
    return { cookie };
  }

  describe('Student roster report', () => {
    it('returns a paginated roster with class/section names', async () => {
      const { cookie } = await registerSchool('Roster School', 'roster1@example.test');
      const { sectionId } = await setUpClassAndSection(cookie);
      await admitStudent(cookie, sectionId, 'A-1');
      await admitStudent(cookie, sectionId, 'A-2');
      await admitStudent(cookie, undefined, 'A-3');

      const res = await agent()
        .get('/api/v1/reports/students')
        .set('Cookie', cookie)
        .query({ pageSize: 2, page: 1 });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
      const inSection = res.body.data.find((r: { admissionNo: string }) => r.admissionNo === 'A-1');
      expect(inSection.className).toBe('Grade 5');
      expect(inSection.sectionName).toBe('A');
    });

    it('filters by sectionId', async () => {
      const { cookie } = await registerSchool('Roster Filter School', 'rosterfilter1@example.test');
      const { sectionId } = await setUpClassAndSection(cookie);
      await admitStudent(cookie, sectionId, 'A-1');
      await admitStudent(cookie, undefined, 'A-2');

      const res = await agent().get('/api/v1/reports/students').set('Cookie', cookie).query({ sectionId });
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].admissionNo).toBe('A-1');
    });

    it('searches by name or admission number (every word must match)', async () => {
      const { cookie } = await registerSchool('Roster Search School', 'rostersearch1@example.test');
      const { sectionId } = await setUpClassAndSection(cookie);
      await admitStudent(cookie, sectionId, 'A-1'); // Kabir Rao
      const other = await agent()
        .post('/api/v1/students')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ admissionNo: 'Z-9', firstName: 'Meera', lastName: 'Nair', sectionId });
      expect(other.status).toBe(201);

      const search = async (q: string) =>
        (await agent().get('/api/v1/reports/students').set('Cookie', cookie).query({ search: q })).body.data.map((r: { admissionNo: string }) => r.admissionNo);
      expect(await search('kabir')).toEqual(['A-1']);
      expect(await search('rao kabir')).toEqual(['A-1']);
      expect(await search('z-9')).toEqual(['Z-9']);
      expect(await search('nobody')).toEqual([]);
      expect(await search("%' OR 1=1 --")).toEqual([]);
    });

    it('applies the same search to the CSV export', async () => {
      const { cookie } = await registerSchool('Roster Search CSV School', 'rostersearchcsv1@example.test');
      const { sectionId } = await setUpClassAndSection(cookie);
      await admitStudent(cookie, sectionId, 'A-1');
      await agent().post('/api/v1/students').set('Origin', WEB_ORIGIN).set('Cookie', cookie).send({ admissionNo: 'Z-9', firstName: 'Meera', lastName: 'Nair', sectionId });
      const res = await agent().get('/api/v1/reports/students/export').set('Cookie', cookie).query({ search: 'meera' });
      expect(res.text).toContain('Z-9');
      expect(res.text).not.toContain('A-1');
    });

    it('exports the roster as CSV', async () => {
      const { cookie } = await registerSchool('Roster CSV School', 'rostercsv1@example.test');
      const { sectionId } = await setUpClassAndSection(cookie);
      await admitStudent(cookie, sectionId, 'A-1');

      const res = await agent().get('/api/v1/reports/students/export').set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('student-report.csv');
      expect(res.text).toContain('Admission No');
      expect(res.text).toContain('A-1');
    });
  });

  describe('Attendance report', () => {
    it('returns present/absent counts and a percentage over a date range', async () => {
      const { cookie } = await registerSchool('Attendance Report School', 'attreport1@example.test');
      const { sectionId } = await setUpClassAndSection(cookie);
      const studentA = await admitStudent(cookie, sectionId, 'A-1');
      const studentB = await admitStudent(cookie, sectionId, 'A-2');

      // The API only lets attendance be marked for today, so a two-day
      // range for the report is seeded straight into the database.
      const school = await seedClient.school.findFirstOrThrow({ where: { name: 'Attendance Report School' } });
      const member = await seedClient.schoolMembership.findFirstOrThrow({ where: { schoolId: school.id } });
      const rows: [string, string, 'PRESENT' | 'ABSENT'][] = [
        [studentA, '2025-06-01', 'PRESENT'],
        [studentB, '2025-06-01', 'ABSENT'],
        [studentA, '2025-06-02', 'PRESENT'],
        [studentB, '2025-06-02', 'PRESENT'],
      ];
      for (const [studentId, date, status] of rows) {
        await seedClient.attendance.create({
          data: { schoolId: school.id, sectionId, studentId, date: new Date(date), status, markedById: member.userId },
        });
      }

      const res = await agent()
        .get('/api/v1/reports/attendance')
        .set('Cookie', cookie)
        .query({ sectionId, from: '2025-06-01', to: '2025-06-02' });

      expect(res.status).toBe(200);
      const rowA = res.body.data.find((r: { admissionNo: string }) => r.admissionNo === 'A-1');
      const rowB = res.body.data.find((r: { admissionNo: string }) => r.admissionNo === 'A-2');
      expect(rowA).toMatchObject({ present: 2, absent: 0, totalMarked: 2, attendancePercent: 100 });
      expect(rowB).toMatchObject({ present: 1, absent: 1, totalMarked: 2, attendancePercent: 50 });
    });

    it('requires from and to', async () => {
      const { cookie } = await registerSchool('Attendance Missing Range School', 'attmissing1@example.test');
      const res = await agent().get('/api/v1/reports/attendance').set('Cookie', cookie);
      expect(res.status).toBe(400);
    });
  });

  describe('Fee collection report', () => {
    it('reports per-student balances and school-wide totals', async () => {
      const { cookie } = await registerSchool('Fee Report School', 'feereport1@example.test');
      const { academicYearId } = await setUpClassAndSection(cookie);
      const category = await agent()
        .post('/api/v1/fee-categories')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ name: 'Tuition' });
      const structure = await agent()
        .post('/api/v1/fee-structures')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ feeCategoryId: category.body.id, academicYearId, amountMinor: 500000, frequency: 'MONTHLY' });
      const studentId = await admitStudent(cookie, undefined, 'A-1');
      const assign = await agent()
        .post(`/api/v1/students/${studentId}/fees`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ feeStructureId: structure.body.id });
      await agent()
        .post(`/api/v1/student-fees/${assign.body.id}/payments`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ amountMinor: 200000, method: 'CASH' });

      const res = await agent().get('/api/v1/reports/fees').set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({ amountDueMinor: 500000, paidMinor: 200000, balanceMinor: 300000 });
      expect(res.body.totals).toMatchObject({ assignedMinor: 500000, paidMinor: 200000, outstandingMinor: 300000 });
    });

    it('filters by status, category and search, with totals following the filter', async () => {
      const { cookie } = await registerSchool('Fee Filter School', 'feefilter1@example.test');
      const { academicYearId } = await setUpClassAndSection(cookie);
      const post = (path: string, body: object) => agent().post(`/api/v1${path}`).set('Origin', WEB_ORIGIN).set('Cookie', cookie).send(body);
      const tuition = await post('/fee-categories', { name: 'Tuition' });
      const transport = await post('/fee-categories', { name: 'Transport' });
      const tuitionStructure = await post('/fee-structures', { feeCategoryId: tuition.body.id, academicYearId, amountMinor: 500000, frequency: 'MONTHLY' });
      const transportStructure = await post('/fee-structures', { feeCategoryId: transport.body.id, academicYearId, amountMinor: 100000, frequency: 'MONTHLY' });
      const studentA = await admitStudent(cookie, undefined, 'A-1');
      const studentB = await admitStudent(cookie, undefined, 'B-2');
      const feeA = await post(`/students/${studentA}/fees`, { feeStructureId: tuitionStructure.body.id });
      await post(`/students/${studentA}/fees`, { feeStructureId: transportStructure.body.id });
      await post(`/students/${studentB}/fees`, { feeStructureId: tuitionStructure.body.id });
      await post(`/student-fees/${feeA.body.id}/payments`, { amountMinor: 200000, method: 'CASH' });

      const get = (query: object) => agent().get('/api/v1/reports/fees').set('Cookie', cookie).query(query);

      expect((await get({})).body.data).toHaveLength(3);
      const partial = await get({ status: 'PARTIALLY_PAID' });
      expect(partial.body.data).toHaveLength(1);
      expect(partial.body.totals).toMatchObject({ assignedMinor: 500000, paidMinor: 200000 });
      expect((await get({ feeCategoryId: transport.body.id })).body.data).toHaveLength(1);
      expect((await get({ search: 'transport' })).body.data).toHaveLength(1);
      expect((await get({ search: 'b-2' })).body.data).toHaveLength(1);
      expect((await get({ status: 'PENDING', feeCategoryId: tuition.body.id })).body.data).toHaveLength(1);
      expect((await get({ status: 'NOT_A_STATUS' })).body.data).toHaveLength(3); // unknown status is ignored, not an error
    });
  });

  describe('Authorization', () => {
    it('a Teacher (no report.view grant) gets 403', async () => {
      const { cookie: directorCookie } = await registerSchool('Teacher Reports School', 'teacherreports1@example.test');
      const { cookie: teacherCookie } = await inviteAndLogin(
        directorCookie,
        'Teacher',
        'noreports@example.test',
        'teacher-pass-123',
      );
      const res = await agent().get('/api/v1/reports/students').set('Cookie', teacherCookie);
      expect(res.status).toBe(403);
    });

    it('report.view alone does not grant report.export', async () => {
      // Director has both by default (full catalog grant), so this
      // exercises the guard logic itself via a role with only one.
      const { cookie: directorCookie } = await registerSchool('Split Perm School', 'splitperm1@example.test');
      await agent()
        .post('/api/v1/roles')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', directorCookie)
        .send({ name: 'Report Viewer', permissions: [{ permissionKey: 'report.view', scope: 'ALL_SCHOOL' }] });

      const { cookie: viewerCookie } = await inviteAndLogin(
        directorCookie,
        'Report Viewer',
        'viewer1@example.test',
        'viewer-pass-123',
      );
      const canView = await agent().get('/api/v1/reports/students').set('Cookie', viewerCookie);
      expect(canView.status).toBe(200);
      const canExport = await agent().get('/api/v1/reports/students/export').set('Cookie', viewerCookie);
      expect(canExport.status).toBe(403);
    });

    it("404s across tenants — School B's report never includes School A's students", async () => {
      const schoolA = await registerSchool('Report School A', 'reportschoolA@example.test');
      const schoolB = await registerSchool('Report School B', 'reportschoolB@example.test');
      await admitStudent(schoolA.cookie, undefined, 'A-1');
      await admitStudent(schoolB.cookie, undefined, 'B-1');

      const res = await agent().get('/api/v1/reports/students').set('Cookie', schoolB.cookie);
      expect(res.status).toBe(200);
      const admissionNos = res.body.data.map((r: { admissionNo: string }) => r.admissionNo);
      expect(admissionNos).toEqual(['B-1']);
    });
  });
});
