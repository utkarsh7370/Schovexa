import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { resetTestData } from './db-helpers';
import { permissionCatalog } from '../prisma/seed-data/permissions';
import { currentYearDates } from './year-helpers';

// End-to-end tests for Phase 6 (Academic Management): Classes, Sections,
// Subjects, Teacher profiles, and teacher-section/subject assignments —
// through the real HTTP stack, proving tenant isolation and permission
// enforcement the same way Phase 5's school-management.e2e-spec.ts did.

const WEB_ORIGIN = 'http://localhost:3000';

describe('Academic Management (e2e)', () => {
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
    return { schoolId: res.body.schoolId as string, cookie: res.headers['set-cookie'], status: res.status };
  }

  async function createAcademicYear(cookie: string) {
    const res = await agent()
      .post('/api/v1/academic-years')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({ name: '2025-26', ...currentYearDates() });
    return res.body.id as string;
  }

  // Invites+activates a user under `roleName`, returning their session
  // cookie and userId — used to set up a real Teacher-role member whose
  // permissions are tested for real, not simulated.
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
    // school, not from the permission check these tests actually mean
    // to exercise.
    const me = await agent().get('/api/v1/auth/me').set('Cookie', cookie);
    const membershipId = me.body.memberships[0].membershipId;
    await agent()
      .post('/api/v1/auth/select-school')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({ membershipId });
    return { cookie, userId: invite.body.userId as string };
  }

  describe('Classes', () => {
    it('creates a class under an academic year', async () => {
      const { cookie } = await registerSchool('Classes School', 'classes1@example.test');
      const academicYearId = await createAcademicYear(cookie);

      const res = await agent()
        .post('/api/v1/classes')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ academicYearId, name: 'Grade 5', order: 5 });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Grade 5');
    });

    it('rejects a duplicate class name within the same academic year', async () => {
      const { cookie } = await registerSchool('Dup Class School', 'dupclass1@example.test');
      const academicYearId = await createAcademicYear(cookie);
      await agent()
        .post('/api/v1/classes')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ academicYearId, name: 'Grade 5', order: 5 });

      const res = await agent()
        .post('/api/v1/classes')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ academicYearId, name: 'Grade 5', order: 5 });
      expect(res.status).toBe(400);
    });

    it("404s when School B tries to update School A's class (cross-tenant)", async () => {
      const schoolA = await registerSchool('School A Classes', 'schoolA-classes@example.test');
      const schoolB = await registerSchool('School B Classes', 'schoolB-classes@example.test');
      const academicYearId = await createAcademicYear(schoolA.cookie);
      const classA = await agent()
        .post('/api/v1/classes')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', schoolA.cookie)
        .send({ academicYearId, name: 'Grade 5', order: 5 });

      const res = await agent()
        .patch(`/api/v1/classes/${classA.body.id}`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', schoolB.cookie)
        .send({ name: 'Hijacked' });
      expect(res.status).toBe(404);
    });

    it('a freshly invited Teacher cannot create a class (403)', async () => {
      const { cookie: directorCookie } = await registerSchool('Teacher Perm School', 'teacherperm1@example.test');
      const academicYearId = await createAcademicYear(directorCookie);
      const { cookie: teacherCookie } = await inviteAndLogin(
        directorCookie,
        'Teacher',
        'teacher-noperm@example.test',
        'classroom-pass-123',
      );

      const res = await agent()
        .post('/api/v1/classes')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', teacherCookie)
        .send({ academicYearId, name: 'Grade 5', order: 5 });
      expect(res.status).toBe(403);
    });
  });

  describe('Sections', () => {
    async function createClass(cookie: string, academicYearId: string, name = 'Grade 5') {
      const res = await agent()
        .post('/api/v1/classes')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ academicYearId, name, order: 5 });
      return res.body.id as string;
    }

    it('creates a section under a class and lists it', async () => {
      const { cookie } = await registerSchool('Sections School', 'sections1@example.test');
      const academicYearId = await createAcademicYear(cookie);
      const classId = await createClass(cookie, academicYearId);

      const create = await agent()
        .post(`/api/v1/classes/${classId}/sections`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ name: 'A' });
      expect(create.status).toBe(201);

      const list = await agent().get(`/api/v1/classes/${classId}/sections`).set('Cookie', cookie);
      expect(list.status).toBe(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0].name).toBe('A');
    });

    it('assigns a class teacher on section update, validated against this school', async () => {
      const { cookie } = await registerSchool('Class Teacher School', 'classteacher1@example.test');
      const academicYearId = await createAcademicYear(cookie);
      const classId = await createClass(cookie, academicYearId);
      const section = await agent()
        .post(`/api/v1/classes/${classId}/sections`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ name: 'A' });

      const { userId } = await inviteAndLogin(cookie, 'Teacher', 'clteacher@example.test', 'clclassroom-pass-123');
      const teacher = await agent()
        .post('/api/v1/teachers')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ userId });

      const update = await agent()
        .patch(`/api/v1/sections/${section.body.id}`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ classTeacherId: teacher.body.id });
      expect(update.status).toBe(200);
      expect(update.body.classTeacherId).toBe(teacher.body.id);
    });

    it("404s creating a section under School A's class from School B", async () => {
      const schoolA = await registerSchool('School A Sections', 'schoolA-sections@example.test');
      const schoolB = await registerSchool('School B Sections', 'schoolB-sections@example.test');
      const academicYearId = await createAcademicYear(schoolA.cookie);
      const classId = await createClass(schoolA.cookie, academicYearId);

      const res = await agent()
        .post(`/api/v1/classes/${classId}/sections`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', schoolB.cookie)
        .send({ name: 'A' });
      expect(res.status).toBe(404);
    });
  });

  describe('Subjects', () => {
    it('creates and updates a subject', async () => {
      const { cookie } = await registerSchool('Subjects School', 'subjects1@example.test');
      const create = await agent()
        .post('/api/v1/subjects')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ name: 'Mathematics', code: 'MATH' });
      expect(create.status).toBe(201);

      const update = await agent()
        .patch(`/api/v1/subjects/${create.body.id}`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ code: 'MTH' });
      expect(update.status).toBe(200);
      expect(update.body.code).toBe('MTH');
    });

    it("404s when School B tries to update School A's subject", async () => {
      const schoolA = await registerSchool('School A Subjects', 'schoolA-subjects@example.test');
      const schoolB = await registerSchool('School B Subjects', 'schoolB-subjects@example.test');
      const subjectA = await agent()
        .post('/api/v1/subjects')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', schoolA.cookie)
        .send({ name: 'Mathematics' });

      const res = await agent()
        .patch(`/api/v1/subjects/${subjectA.body.id}`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', schoolB.cookie)
        .send({ name: 'Hijacked' });
      expect(res.status).toBe(404);
    });
  });

  describe('Teachers', () => {
    it('creates a teacher profile from an active staff member', async () => {
      const { cookie } = await registerSchool('Teachers School', 'teachers1@example.test');
      const { userId } = await inviteAndLogin(cookie, 'Teacher', 'newteacher@example.test', 'newclassroom-pass-123');

      const res = await agent()
        .post('/api/v1/teachers')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ userId, employeeCode: 'EMP-001' });
      expect(res.status).toBe(201);
      expect(res.body.user.email).toBe('newteacher@example.test');

      const list = await agent().get('/api/v1/teachers').set('Cookie', cookie);
      expect(list.body).toHaveLength(1);
    });

    it('rejects creating a teacher profile for a user with no active membership in this school', async () => {
      const schoolA = await registerSchool('School A Teachers', 'schoolA-teachers@example.test');
      const schoolB = await registerSchool('School B Teachers', 'schoolB-teachers@example.test');
      const { userId } = await inviteAndLogin(
        schoolA.cookie,
        'Teacher',
        'crossteacher@example.test',
        'crossclassroom-pass-123',
      );

      const res = await agent()
        .post('/api/v1/teachers')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', schoolB.cookie)
        .send({ userId });
      expect(res.status).toBe(400);
    });

    it('assigns a teacher to a section+subject and lists/removes the assignment', async () => {
      const { cookie } = await registerSchool('Assignment School', 'assignment1@example.test');
      const academicYearId = await createAcademicYear(cookie);
      const klass = await agent()
        .post('/api/v1/classes')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ academicYearId, name: 'Grade 5', order: 5 });
      const section = await agent()
        .post(`/api/v1/classes/${klass.body.id}/sections`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ name: 'A' });
      const subject = await agent()
        .post('/api/v1/subjects')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ name: 'Mathematics' });
      const { userId } = await inviteAndLogin(cookie, 'Teacher', 'assignteacher@example.test', 'assign-pass-123');
      const teacher = await agent()
        .post('/api/v1/teachers')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ userId });

      const assign = await agent()
        .post(`/api/v1/teachers/${teacher.body.id}/assignments`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ sectionId: section.body.id, subjectId: subject.body.id });
      expect(assign.status).toBe(201);

      const list = await agent().get(`/api/v1/teachers/${teacher.body.id}/assignments`).set('Cookie', cookie);
      expect(list.body).toHaveLength(1);

      const remove = await agent()
        .delete(`/api/v1/teachers/${teacher.body.id}/assignments/${assign.body.id}`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie);
      expect(remove.status).toBe(200);

      const listAfter = await agent().get(`/api/v1/teachers/${teacher.body.id}/assignments`).set('Cookie', cookie);
      expect(listAfter.body).toHaveLength(0);
    });

    it("404s when School B tries to update School A's teacher", async () => {
      const schoolA = await registerSchool('School A Teacher Update', 'schoolA-teacherupdate@example.test');
      const schoolB = await registerSchool('School B Teacher Update', 'schoolB-teacherupdate@example.test');
      const { userId } = await inviteAndLogin(
        schoolA.cookie,
        'Teacher',
        'teacherA@example.test',
        'zebra-lantern-pass-9',
      );
      const teacherA = await agent()
        .post('/api/v1/teachers')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', schoolA.cookie)
        .send({ userId });

      const res = await agent()
        .patch(`/api/v1/teachers/${teacherA.body.id}`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', schoolB.cookie)
        .send({ employeeCode: 'HIJACKED' });
      expect(res.status).toBe(404);
    });
  });
});
