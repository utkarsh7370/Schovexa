import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { resetTestData } from './db-helpers';
import { permissionCatalog } from '../prisma/seed-data/permissions';

// End-to-end tests for Phase 7 (Student Management): students (admission
// records), parents, student-parent linking, and student documents — all
// through the real HTTP stack, following the academics.e2e-spec.ts
// pattern (fresh app per test, real permission enforcement, real
// cross-tenant isolation checks).

const WEB_ORIGIN = 'http://localhost:3000';

describe('Student Management (e2e)', () => {
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
    return { schoolId: res.body.schoolId as string, cookie: res.headers['set-cookie'] as string, status: res.status };
  }

  async function createStudent(cookie: string, admissionNo = 'A-001') {
    const res = await agent()
      .post('/api/v1/students')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({ admissionNo, firstName: 'Kabir', lastName: 'Singh' });
    return res;
  }

  async function createParent(cookie: string, firstName = 'Meera') {
    const res = await agent()
      .post('/api/v1/parents')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({ firstName, lastName: 'Singh', phone: '+91-9000000000' });
    return res;
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
    // school, not from the permission check these tests actually mean
    // to exercise.
    const me = await agent().get('/api/v1/auth/me').set('Cookie', cookie);
    const membershipId = me.body.memberships[0].membershipId;
    await agent()
      .post('/api/v1/auth/select-school')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({ membershipId });
    return { cookie };
  }

  describe('Students', () => {
    it('creates a student admission record', async () => {
      const { cookie } = await registerSchool('Students School', 'students1@example.test');
      const res = await createStudent(cookie);
      expect(res.status).toBe(201);
      expect(res.body.admissionNo).toBe('A-001');
      expect(res.body.status).toBe('ENROLLED');
    });

    it('rejects a duplicate admission number', async () => {
      const { cookie } = await registerSchool('Dup Admission School', 'dupadmission1@example.test');
      await createStudent(cookie, 'A-100');
      const second = await createStudent(cookie, 'A-100');
      expect(second.status).toBe(400);
    });

    it('updates a student status and reassigns their section', async () => {
      const { cookie } = await registerSchool('Update Student School', 'updatestudent1@example.test');
      const student = await createStudent(cookie);

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

      const res = await agent()
        .patch(`/api/v1/students/${student.body.id}`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ sectionId: section.body.id, status: 'TRANSFERRED' });
      expect(res.status).toBe(200);
      expect(res.body.sectionId).toBe(section.body.id);
      expect(res.body.status).toBe('TRANSFERRED');
    });

    it('soft-deletes a student', async () => {
      const { cookie } = await registerSchool('Delete Student School', 'deletestudent1@example.test');
      const student = await createStudent(cookie);
      const del = await agent()
        .delete(`/api/v1/students/${student.body.id}`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie);
      expect(del.status).toBe(200);

      const getAfter = await agent().get(`/api/v1/students/${student.body.id}`).set('Cookie', cookie);
      expect(getAfter.status).toBe(404);
    });

    it("404s when School B tries to update School A's student (cross-tenant)", async () => {
      const schoolA = await registerSchool('School A Students', 'schoolA-students@example.test');
      const schoolB = await registerSchool('School B Students', 'schoolB-students@example.test');
      const studentA = await createStudent(schoolA.cookie);

      const res = await agent()
        .patch(`/api/v1/students/${studentA.body.id}`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', schoolB.cookie)
        .send({ firstName: 'Hijacked' });
      expect(res.status).toBe(404);
    });

    it('a freshly invited Teacher cannot create a student (403)', async () => {
      const { cookie: directorCookie } = await registerSchool('Teacher Perm Students', 'teacherpermstudents@example.test');
      const { cookie: teacherCookie } = await inviteAndLogin(
        directorCookie,
        'Teacher',
        'teacher-noperm-students@example.test',
        'teacher-pass-123',
      );

      const res = await agent()
        .post('/api/v1/students')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', teacherCookie)
        .send({ admissionNo: 'A-999', firstName: 'X', lastName: 'Y' });
      expect(res.status).toBe(403);
    });
  });

  describe('Parents and linking', () => {
    it('creates a parent profile and links it to a student', async () => {
      const { cookie } = await registerSchool('Linking School', 'linking1@example.test');
      const student = await createStudent(cookie);
      const parent = await createParent(cookie);
      expect(parent.status).toBe(201);

      const link = await agent()
        .post(`/api/v1/students/${student.body.id}/parents`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ parentId: parent.body.id, relation: 'Mother', isPrimary: true });
      expect(link.status).toBe(201);

      const detail = await agent().get(`/api/v1/students/${student.body.id}`).set('Cookie', cookie);
      expect(detail.body.parents).toHaveLength(1);
      expect(detail.body.parents[0].parent.firstName).toBe('Meera');
    });

    it('rejects linking the same parent twice', async () => {
      const { cookie } = await registerSchool('Dup Link School', 'duplink1@example.test');
      const student = await createStudent(cookie);
      const parent = await createParent(cookie);
      await agent()
        .post(`/api/v1/students/${student.body.id}/parents`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ parentId: parent.body.id, relation: 'Mother' });

      const second = await agent()
        .post(`/api/v1/students/${student.body.id}/parents`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ parentId: parent.body.id, relation: 'Mother' });
      expect(second.status).toBe(400);
    });

    it('unlinks a parent from a student', async () => {
      const { cookie } = await registerSchool('Unlink School', 'unlink1@example.test');
      const student = await createStudent(cookie);
      const parent = await createParent(cookie);
      await agent()
        .post(`/api/v1/students/${student.body.id}/parents`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ parentId: parent.body.id, relation: 'Mother' });

      const unlink = await agent()
        .delete(`/api/v1/students/${student.body.id}/parents/${parent.body.id}`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie);
      expect(unlink.status).toBe(200);

      const detail = await agent().get(`/api/v1/students/${student.body.id}`).set('Cookie', cookie);
      expect(detail.body.parents).toHaveLength(0);
    });

    it("404s linking School B's parent to School A's student", async () => {
      const schoolA = await registerSchool('School A Link', 'schoolA-link@example.test');
      const schoolB = await registerSchool('School B Link', 'schoolB-link@example.test');
      const studentA = await createStudent(schoolA.cookie);
      const parentB = await createParent(schoolB.cookie);

      const res = await agent()
        .post(`/api/v1/students/${studentA.body.id}/parents`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', schoolA.cookie)
        .send({ parentId: parentB.body.id, relation: 'Mother' });
      expect(res.status).toBe(404);
    });
  });

  describe('Documents', () => {
    it('uploads, lists, downloads, and deletes a student document', async () => {
      const { cookie } = await registerSchool('Docs School', 'docs1@example.test');
      const student = await createStudent(cookie);
      const fileContent = Buffer.from('%PDF-1.4 fake pdf content for testing');

      const upload = await agent()
        .post(`/api/v1/students/${student.body.id}/documents`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .attach('file', fileContent, { filename: 'birth-certificate.pdf', contentType: 'application/pdf' });
      expect(upload.status).toBe(201);
      expect(upload.body.fileName).toBe('birth-certificate.pdf');

      const list = await agent().get(`/api/v1/students/${student.body.id}/documents`).set('Cookie', cookie);
      expect(list.body).toHaveLength(1);

      const download = await agent().get(`/api/v1/documents/${upload.body.id}/download`).set('Cookie', cookie);
      expect(download.status).toBe(200);
      expect(download.body.toString()).toContain('fake pdf content');

      const del = await agent()
        .delete(`/api/v1/documents/${upload.body.id}`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie);
      expect(del.status).toBe(200);

      const listAfter = await agent().get(`/api/v1/students/${student.body.id}/documents`).set('Cookie', cookie);
      expect(listAfter.body).toHaveLength(0);
    });

    it('rejects an unsupported file type', async () => {
      const { cookie } = await registerSchool('Bad Filetype School', 'badfiletype1@example.test');
      const student = await createStudent(cookie);

      const upload = await agent()
        .post(`/api/v1/students/${student.body.id}/documents`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .attach('file', Buffer.from('not allowed'), { filename: 'virus.exe', contentType: 'application/x-msdownload' });
      expect(upload.status).toBe(400);
    });

    it("404s when School B tries to download School A's document", async () => {
      const schoolA = await registerSchool('School A Docs', 'schoolA-docs@example.test');
      const schoolB = await registerSchool('School B Docs', 'schoolB-docs@example.test');
      const studentA = await createStudent(schoolA.cookie);
      const upload = await agent()
        .post(`/api/v1/students/${studentA.body.id}/documents`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', schoolA.cookie)
        .attach('file', Buffer.from('%PDF-1.4'), { filename: 'report.pdf', contentType: 'application/pdf' });

      const res = await agent().get(`/api/v1/documents/${upload.body.id}/download`).set('Cookie', schoolB.cookie);
      expect(res.status).toBe(404);
    });
  });
});
