import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetTestData } from './db-helpers';

// End-to-end tests through the real HTTP stack for GET /students/:id —
// the Phase 4 demonstration endpoint that exercises the full pipeline:
// AuthGuard -> SchoolContextGuard -> PermissionGuard -> authorizeResource.
// Covers the applicable rows of the cross-tenant test matrix
// (docs/multi-tenancy.md §5). Rows 2, 7, 8 (fees, admin settings,
// platform admin) are NOT covered here — those modules don't exist yet
// and are deferred to their own phases, not faked here.

const WEB_ORIGIN = 'http://localhost:3000';

describe('Students (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    authService = moduleRef.get(AuthService);

    await prisma.permission.upsert({
      where: { key: 'student.view' },
      update: {},
      create: { key: 'student.view', module: 'student', action: 'view', description: 'View student records' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetTestData(prisma);
  });

  const agent = () => request(app.getHttpServer());

  async function makeSchoolWithGrantedUser(schoolName: string, slug: string, scope: string) {
    const school = await prisma.school.create({ data: { name: schoolName, slug } });
    const role = await prisma.role.create({ data: { schoolId: school.id, name: 'TestRole' } });
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: 'student.view' } });
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: permission.id, scope: scope as never },
    });

    const password = 'correct-horse-battery';
    const user = await prisma.user.create({
      data: {
        email: `${slug}@example.test`,
        firstName: 'T',
        lastName: 'U',
        status: 'ACTIVE',
        passwordHash: await authService.hashPassword(password),
      },
    });
    const membership = await prisma.schoolMembership.create({
      data: { userId: user.id, schoolId: school.id, roleId: role.id },
    });

    return { school, role, user, membership, password };
  }

  async function loginAndSelectSchool(email: string, password: string, membershipId: string) {
    const login = await agent()
      .post('/api/v1/auth/login')
      .set('Origin', WEB_ORIGIN)
      .send({ email, password });
    const cookie = login.headers['set-cookie'];

    await agent()
      .post('/api/v1/auth/select-school')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({ membershipId });

    return cookie;
  }

  it('allows an ALL_SCHOOL-scoped admin to view a student in their own school', async () => {
    const { school, user, membership, password } = await makeSchoolWithGrantedUser(
      'School A',
      'e2e-all-school',
      'ALL_SCHOOL',
    );
    const student = await prisma.student.create({
      data: { schoolId: school.id, admissionNo: 'A1', firstName: 'S', lastName: 'T' },
    });
    const cookie = await loginAndSelectSchool(user.email, password, membership.id);

    const res = await agent().get(`/api/v1/students/${student.id}`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.admissionNo).toBe('A1');
  });

  it('404s a student belonging to a different school (matrix row 1)', async () => {
    const { user, membership, password } = await makeSchoolWithGrantedUser(
      'School A',
      'e2e-cross-tenant',
      'ALL_SCHOOL',
    );
    const schoolB = await prisma.school.create({ data: { name: 'School B', slug: 'e2e-cross-tenant-b' } });
    const studentInB = await prisma.student.create({
      data: { schoolId: schoolB.id, admissionNo: 'B1', firstName: 'S', lastName: 'T' },
    });
    const cookie = await loginAndSelectSchool(user.email, password, membership.id);

    const res = await agent().get(`/api/v1/students/${studentInB.id}`).set('Cookie', cookie);
    expect(res.status).toBe(404);
  });

  it('ignores a client-supplied schoolId query param — session is authoritative (matrix row 12)', async () => {
    const { school, user, membership, password } = await makeSchoolWithGrantedUser(
      'School A',
      'e2e-no-trust-client',
      'ALL_SCHOOL',
    );
    const schoolB = await prisma.school.create({ data: { name: 'School B', slug: 'e2e-no-trust-client-b' } });
    const student = await prisma.student.create({
      data: { schoolId: school.id, admissionNo: 'A2', firstName: 'S', lastName: 'T' },
    });
    const cookie = await loginAndSelectSchool(user.email, password, membership.id);

    // Attempt to lie about the tenant via a query param — must have zero
    // effect, since schoolId always comes from the session.
    const res = await agent()
      .get(`/api/v1/students/${student.id}`)
      .query({ schoolId: schoolB.id })
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(student.id);
  });

  it('403s when the role does not grant student.view at all', async () => {
    const school = await prisma.school.create({ data: { name: 'S', slug: 'e2e-no-permission' } });
    const role = await prisma.role.create({ data: { schoolId: school.id, name: 'NoPermsRole' } });
    const password = 'correct-horse-battery';
    const user = await prisma.user.create({
      data: {
        email: 'noperm@example.test',
        firstName: 'T',
        lastName: 'U',
        status: 'ACTIVE',
        passwordHash: await authService.hashPassword(password),
      },
    });
    const membership = await prisma.schoolMembership.create({
      data: { userId: user.id, schoolId: school.id, roleId: role.id },
    });
    const student = await prisma.student.create({
      data: { schoolId: school.id, admissionNo: 'NP1', firstName: 'S', lastName: 'T' },
    });
    const cookie = await loginAndSelectSchool(user.email, password, membership.id);

    const res = await agent().get(`/api/v1/students/${student.id}`).set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('403s when no active school has been selected on the session', async () => {
    const { user, password } = await makeSchoolWithGrantedUser('S', 'e2e-no-active-school', 'ALL_SCHOOL');
    const login = await agent().post('/api/v1/auth/login').set('Origin', WEB_ORIGIN).send({
      email: user.email,
      password,
    });
    const cookie = login.headers['set-cookie']; // no select-school call

    const res = await agent().get('/api/v1/students/anything').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('403s once the membership is suspended mid-session (matrix row 11)', async () => {
    const { school, user, membership, password } = await makeSchoolWithGrantedUser(
      'S',
      'e2e-suspended-membership',
      'ALL_SCHOOL',
    );
    const student = await prisma.student.create({
      data: { schoolId: school.id, admissionNo: 'SU1', firstName: 'S', lastName: 'T' },
    });
    const cookie = await loginAndSelectSchool(user.email, password, membership.id);

    expect((await agent().get(`/api/v1/students/${student.id}`).set('Cookie', cookie)).status).toBe(200);

    await prisma.schoolMembership.update({ where: { id: membership.id }, data: { status: 'SUSPENDED' } });

    expect((await agent().get(`/api/v1/students/${student.id}`).set('Cookie', cookie)).status).toBe(403);
  });

  it('401s immediately once the user is disabled mid-session (matrix row 9)', async () => {
    const { school, user, membership, password } = await makeSchoolWithGrantedUser(
      'S',
      'e2e-disabled-user',
      'ALL_SCHOOL',
    );
    const student = await prisma.student.create({
      data: { schoolId: school.id, admissionNo: 'DU1', firstName: 'S', lastName: 'T' },
    });
    const cookie = await loginAndSelectSchool(user.email, password, membership.id);

    expect((await agent().get(`/api/v1/students/${student.id}`).set('Cookie', cookie)).status).toBe(200);

    await prisma.user.update({ where: { id: user.id }, data: { status: 'DISABLED' } });

    expect((await agent().get(`/api/v1/students/${student.id}`).set('Cookie', cookie)).status).toBe(401);
  });

  it('401s with an expired session (matrix row 10)', async () => {
    const { school, user, membership, password } = await makeSchoolWithGrantedUser(
      'S',
      'e2e-expired-session',
      'ALL_SCHOOL',
    );
    const student = await prisma.student.create({
      data: { schoolId: school.id, admissionNo: 'EX1', firstName: 'S', lastName: 'T' },
    });
    const cookie = await loginAndSelectSchool(user.email, password, membership.id);

    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect((await agent().get(`/api/v1/students/${student.id}`).set('Cookie', cookie)).status).toBe(401);
  });

  it('401s with no session at all', async () => {
    const res = await agent().get('/api/v1/students/anything');
    expect(res.status).toBe(401);
  });

  it("returns 404, never a raw Prisma/stack error, for a resource id that doesn't exist", async () => {
    const { user, membership, password } = await makeSchoolWithGrantedUser('S', 'e2e-not-found', 'ALL_SCHOOL');
    const cookie = await loginAndSelectSchool(user.email, password, membership.id);

    const res = await agent().get('/api/v1/students/does-not-exist').set('Cookie', cookie);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/prisma|stack|at Object/i);
  });
});
