import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { resetTestData } from './db-helpers';
import { permissionCatalog } from '../prisma/seed-data/permissions';

// End-to-end tests for Phase 11 (Parent Portal Login): wiring a Parent
// contact record up to an actual portal login (POST /parents/:id/invite),
// plus the two list-endpoint scope-filtering fixes this phase required
// (GET /students, GET /fees/outstanding) — neither previously respected
// auth.scope, which was harmless while only ALL_SCHOOL-scoped roles ever
// called them but becomes a real cross-family/cross-section leak the
// moment an OWN_CHILDREN- or OWN_STUDENTS-scoped login can reach them.

const WEB_ORIGIN = 'http://localhost:3000';

describe('Parent Portal (e2e)', () => {
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
    return { academicYearId: ay.body.id as string, classId: klass.body.id as string, sectionId: section.body.id as string };
  }

  async function admitStudent(cookie: string, sectionId: string | undefined, admissionNo: string) {
    const res = await agent()
      .post('/api/v1/students')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({ admissionNo, firstName: 'Kabir', lastName: 'Rao', ...(sectionId ? { sectionId } : {}) });
    return res.body.id as string;
  }

  async function createParent(cookie: string, firstName = 'Meera', email?: string) {
    const res = await agent()
      .post('/api/v1/parents')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({ firstName, lastName: 'Singh', ...(email ? { email } : {}) });
    return res.body.id as string;
  }

  async function linkParent(cookie: string, studentId: string, parentId: string, relation = 'Mother') {
    await agent()
      .post(`/api/v1/students/${studentId}/parents`)
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({ parentId, relation });
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
    return loginAs(email, password);
  }

  // Login does NOT auto-select a school (only registration does,
  // docs/multi-tenancy.md §2) — every school-scoped call after this
  // would otherwise 403 from SchoolContextGuard for having no active
  // school, not from whatever the test actually means to exercise.
  async function loginAs(email: string, password: string) {
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

  describe('Inviting a parent to the portal', () => {
    it('invites a parent (with an explicit email), they accept, log in, and select the school', async () => {
      const { cookie } = await registerSchool('Portal Invite School', 'portalinvite1@example.test');
      const parentId = await createParent(cookie, 'Meera');

      const invite = await agent()
        .post(`/api/v1/parents/${parentId}/invite`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ email: 'meera-parent@example.test' });
      expect(invite.status).toBe(200);
      expect(invite.body.inviteToken).toBeTruthy();

      await agent()
        .post('/api/v1/auth/accept-invite')
        .set('Origin', WEB_ORIGIN)
        .send({ token: invite.body.inviteToken, password: 'parent-pass-123' });
      const { cookie: parentCookie } = await loginAs('meera-parent@example.test', 'parent-pass-123');

      const me = await agent().get('/api/v1/auth/me').set('Cookie', parentCookie);
      expect(me.body.activeSchoolId).toBeTruthy();
    });

    it('uses the Parent record\'s own email when none is provided in the request', async () => {
      const { cookie } = await registerSchool('Own Email School', 'ownemail1@example.test');
      const parentId = await createParent(cookie, 'Meera', 'meera-own-email@example.test');

      const invite = await agent()
        .post(`/api/v1/parents/${parentId}/invite`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({});
      expect(invite.status).toBe(200);

      await agent()
        .post('/api/v1/auth/accept-invite')
        .set('Origin', WEB_ORIGIN)
        .send({ token: invite.body.inviteToken, password: 'parent-pass-123' });
      const login = await agent()
        .post('/api/v1/auth/login')
        .set('Origin', WEB_ORIGIN)
        .send({ email: 'meera-own-email@example.test', password: 'parent-pass-123' });
      expect(login.status).toBe(200);
    });

    it('rejects inviting a parent with no email on the record and none provided', async () => {
      const { cookie } = await registerSchool('No Email School', 'noemail1@example.test');
      const parentId = await createParent(cookie, 'Meera');

      const res = await agent()
        .post(`/api/v1/parents/${parentId}/invite`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({});
      expect(res.status).toBe(400);
    });

    it('rejects re-inviting a parent that is already linked to a portal login', async () => {
      const { cookie } = await registerSchool('Already Linked School', 'alreadylinked1@example.test');
      const parentId = await createParent(cookie, 'Meera', 'meera-linked@example.test');
      await agent()
        .post(`/api/v1/parents/${parentId}/invite`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({});

      const second = await agent()
        .post(`/api/v1/parents/${parentId}/invite`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({});
      expect(second.status).toBe(400);
    });

    it('links a second child\'s parent record to the same existing portal user, not a duplicate', async () => {
      const { cookie } = await registerSchool('Two Children School', 'twochildren1@example.test');
      const email = 'shared-parent@example.test';
      const child1 = await admitStudent(cookie, undefined, 'A-1');
      const child2 = await admitStudent(cookie, undefined, 'A-2');
      const parent1 = await createParent(cookie, 'Meera', email);
      const parent2 = await createParent(cookie, 'Meera', email);
      await linkParent(cookie, child1, parent1);
      await linkParent(cookie, child2, parent2);

      const invite1 = await agent()
        .post(`/api/v1/parents/${parent1}/invite`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({});
      expect(invite1.status).toBe(200);
      await agent()
        .post('/api/v1/auth/accept-invite')
        .set('Origin', WEB_ORIGIN)
        .send({ token: invite1.body.inviteToken, password: 'parent-pass-123' });

      // The second Parent row's email matches an already-ACTIVE portal
      // user under the Parent role at this school — invite() should link
      // it directly rather than reissuing an invite token.
      const invite2 = await agent()
        .post(`/api/v1/parents/${parent2}/invite`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({});
      expect(invite2.status).toBe(200);
      expect(invite2.body.inviteToken).toBeNull();
      expect(invite2.body.userId).toBe(invite1.body.userId);

      const { cookie: parentCookie } = await loginAs(email, 'parent-pass-123');
      const students = await agent().get('/api/v1/students').set('Cookie', parentCookie);
      expect(students.body.map((s: { id: string }) => s.id).sort()).toEqual([child1, child2].sort());
    });

    it("404s when School B tries to invite School A's parent (cross-tenant)", async () => {
      const schoolA = await registerSchool('School A Invite', 'schoolA-invite@example.test');
      const schoolB = await registerSchool('School B Invite', 'schoolB-invite@example.test');
      const parentIdA = await createParent(schoolA.cookie, 'Meera', 'meera-crosstenant@example.test');

      const res = await agent()
        .post(`/api/v1/parents/${parentIdA}/invite`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', schoolB.cookie)
        .send({});
      expect(res.status).toBe(404);
    });
  });

  describe('Parent-scoped visibility', () => {
    async function setUpParentWithOneChild() {
      const { cookie: directorCookie } = await registerSchool('Scoped School', `scoped-${Date.now()}@example.test`);
      const myChild = await admitStudent(directorCookie, undefined, 'A-1');
      const otherChild = await admitStudent(directorCookie, undefined, 'A-2');
      const parentId = await createParent(directorCookie, 'Meera', 'meera-scoped@example.test');
      await linkParent(directorCookie, myChild, parentId);

      const invite = await agent()
        .post(`/api/v1/parents/${parentId}/invite`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', directorCookie)
        .send({});
      await agent()
        .post('/api/v1/auth/accept-invite')
        .set('Origin', WEB_ORIGIN)
        .send({ token: invite.body.inviteToken, password: 'parent-pass-123' });
      const { cookie: parentCookie } = await loginAs('meera-scoped@example.test', 'parent-pass-123');

      return { directorCookie, parentCookie, myChild, otherChild };
    }

    it('a parent sees only their own linked child via GET /students, not the whole school', async () => {
      const { parentCookie, myChild, otherChild } = await setUpParentWithOneChild();

      const res = await agent().get('/api/v1/students').set('Cookie', parentCookie);
      expect(res.status).toBe(200);
      expect(res.body.map((s: { id: string }) => s.id)).toEqual([myChild]);
      expect(res.body.map((s: { id: string }) => s.id)).not.toContain(otherChild);
    });

    it('a parent cannot view another, unlinked student directly (404, not the record)', async () => {
      const { parentCookie, otherChild } = await setUpParentWithOneChild();

      const res = await agent().get(`/api/v1/students/${otherChild}`).set('Cookie', parentCookie);
      expect(res.status).toBe(404);
    });

    it("a parent's outstanding-fees view is limited to their own child, not the whole school", async () => {
      const { directorCookie, parentCookie, myChild, otherChild } = await setUpParentWithOneChild();
      const { academicYearId } = await setUpClassAndSection(directorCookie);
      const categoryId = await agent()
        .post('/api/v1/fee-categories')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', directorCookie)
        .send({ name: 'Tuition' })
        .then((r) => r.body.id);
      const structureId = await agent()
        .post('/api/v1/fee-structures')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', directorCookie)
        .send({ feeCategoryId: categoryId, academicYearId, amountMinor: 500000, frequency: 'MONTHLY' })
        .then((r) => r.body.id);
      await agent()
        .post(`/api/v1/students/${myChild}/fees`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', directorCookie)
        .send({ feeStructureId: structureId });
      await agent()
        .post(`/api/v1/students/${otherChild}/fees`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', directorCookie)
        .send({ feeStructureId: structureId });

      const directorReport = await agent().get('/api/v1/fees/outstanding').set('Cookie', directorCookie);
      expect(directorReport.body).toHaveLength(2);

      const parentReport = await agent().get('/api/v1/fees/outstanding').set('Cookie', parentCookie);
      expect(parentReport.status).toBe(200);
      expect(parentReport.body).toHaveLength(1);
      expect(parentReport.body[0].student.id).toBe(myChild);

      // Also directly reachable and correctly scoped via the
      // already-authorizeResource()-backed per-student route.
      const ownFees = await agent().get(`/api/v1/students/${myChild}/fees`).set('Cookie', parentCookie);
      expect(ownFees.status).toBe(200);
      expect(ownFees.body).toHaveLength(1);
    });

    it("a parent can view their own child's attendance history but not another student's", async () => {
      const { parentCookie, myChild, otherChild } = await setUpParentWithOneChild();

      const ownHistory = await agent()
        .get(`/api/v1/attendance/history?studentId=${myChild}&from=2025-01-01&to=2025-12-31`)
        .set('Cookie', parentCookie);
      expect(ownHistory.status).toBe(200);

      const otherHistory = await agent()
        .get(`/api/v1/attendance/history?studentId=${otherChild}&from=2025-01-01&to=2025-12-31`)
        .set('Cookie', parentCookie);
      expect(otherHistory.status).toBe(404);
    });
  });

  describe('Teacher list-scoping regression', () => {
    it("a Teacher sees only their own section's students via GET /students, not the whole school", async () => {
      const { cookie: directorCookie } = await registerSchool('Teacher Scope School', 'teacherscope1@example.test');
      const { sectionId } = await setUpClassAndSection(directorCookie);
      const myStudent = await admitStudent(directorCookie, sectionId, 'A-1');
      const otherStudent = await admitStudent(directorCookie, undefined, 'A-2');

      const { cookie: teacherCookie } = await inviteAndLogin(
        directorCookie,
        'Teacher',
        'teacher-scope@example.test',
        'teacher-pass-123',
      );

      // Teacher's OWN_STUDENTS scope is section-based — no section
      // assignment yet means no visible students at all, not the whole
      // school (the pre-Phase-11 bug this test guards against).
      const beforeAssignment = await agent().get('/api/v1/students').set('Cookie', teacherCookie);
      expect(beforeAssignment.body).toEqual([]);

      const subject = await agent()
        .post('/api/v1/subjects')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', directorCookie)
        .send({ name: 'Mathematics' });
      const memberships = await agent().get('/api/v1/memberships').set('Cookie', directorCookie);
      const teacherMembership = memberships.body.find(
        (m: { user: { email: string } }) => m.user.email === 'teacher-scope@example.test',
      );
      const teacher = await agent()
        .post('/api/v1/teachers')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', directorCookie)
        .send({ userId: teacherMembership.user.id });
      await agent()
        .post(`/api/v1/teachers/${teacher.body.id}/assignments`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', directorCookie)
        .send({ sectionId, subjectId: subject.body.id });

      const res = await agent().get('/api/v1/students').set('Cookie', teacherCookie);
      expect(res.status).toBe(200);
      expect(res.body.map((s: { id: string }) => s.id)).toEqual([myStudent]);
      expect(res.body.map((s: { id: string }) => s.id)).not.toContain(otherStudent);
    });
  });
});
