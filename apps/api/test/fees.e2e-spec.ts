import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { resetTestData } from './db-helpers';
import { permissionCatalog } from '../prisma/seed-data/permissions';
import { currentYearDates } from './year-helpers';

// End-to-end tests for Phase 9 (Fees): categories, structures, per-student
// assignment (including bulk assignment to a class), manually recorded
// payments with auto-generated receipts, waiving, and the outstanding-
// balance report — all through the real HTTP stack, reusing the existing
// 'Student' ResourceType authorization (no new resource type needed).

const WEB_ORIGIN = 'http://localhost:3000';

describe('Fees (e2e)', () => {
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

  async function createCategory(cookie: string, name = 'Tuition') {
    const res = await agent()
      .post('/api/v1/fee-categories')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({ name });
    return res.body.id as string;
  }

  async function createStructure(
    cookie: string,
    feeCategoryId: string,
    academicYearId: string,
    classId?: string,
    amountMinor = 500000,
  ) {
    const res = await agent()
      .post('/api/v1/fee-structures')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({ feeCategoryId, academicYearId, classId, amountMinor, frequency: 'MONTHLY' });
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

  describe('Categories and structures', () => {
    it('creates a fee category', async () => {
      const { cookie } = await registerSchool('Fees School', 'fees1@example.test');
      const res = await agent()
        .post('/api/v1/fee-categories')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ name: 'Tuition' });
      expect(res.status).toBe(201);
    });

    it('rejects a duplicate category name', async () => {
      const { cookie } = await registerSchool('Dup Category School', 'dupcategory1@example.test');
      await createCategory(cookie, 'Tuition');
      const second = await agent()
        .post('/api/v1/fee-categories')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ name: 'Tuition' });
      expect(second.status).toBe(400);
    });

    it('creates a fee structure scoped to a class', async () => {
      const { cookie } = await registerSchool('Structure School', 'structure1@example.test');
      const { academicYearId, classId } = await setUpClassAndSection(cookie);
      const categoryId = await createCategory(cookie);

      const res = await agent()
        .post('/api/v1/fee-structures')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ feeCategoryId: categoryId, academicYearId, classId, amountMinor: 500000, frequency: 'MONTHLY' });
      expect(res.status).toBe(201);
      expect(res.body.amountMinor).toBe(500000);
    });
  });

  describe('Assignment', () => {
    it("assigns a fee structure to a student, defaulting the amount from the structure", async () => {
      const { cookie } = await registerSchool('Assign School', 'assign1@example.test');
      const { academicYearId } = await setUpClassAndSection(cookie);
      const categoryId = await createCategory(cookie);
      const structureId = await createStructure(cookie, categoryId, academicYearId);
      const studentId = await admitStudent(cookie, undefined, 'A-1');

      const res = await agent()
        .post(`/api/v1/students/${studentId}/fees`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ feeStructureId: structureId });
      expect(res.status).toBe(201);
      expect(res.body.amountDueMinor).toBe(500000);
      expect(res.body.status).toBe('PENDING');
    });

    it('rejects assigning the same structure to the same student twice', async () => {
      const { cookie } = await registerSchool('Dup Assign School', 'dupassign1@example.test');
      const { academicYearId } = await setUpClassAndSection(cookie);
      const categoryId = await createCategory(cookie);
      const structureId = await createStructure(cookie, categoryId, academicYearId);
      const studentId = await admitStudent(cookie, undefined, 'A-1');

      await agent()
        .post(`/api/v1/students/${studentId}/fees`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ feeStructureId: structureId });
      const second = await agent()
        .post(`/api/v1/students/${studentId}/fees`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ feeStructureId: structureId });
      expect(second.status).toBe(400);
    });

    it('bulk-assigns a class-scoped structure to every enrolled student in that class, skipping repeats', async () => {
      const { cookie } = await registerSchool('Bulk Assign School', 'bulkassign1@example.test');
      const { academicYearId, classId, sectionId } = await setUpClassAndSection(cookie);
      const categoryId = await createCategory(cookie);
      const structureId = await createStructure(cookie, categoryId, academicYearId, classId);
      await admitStudent(cookie, sectionId, 'A-1');
      await admitStudent(cookie, sectionId, 'A-2');
      await admitStudent(cookie, undefined, 'A-3'); // not in this class — should be skipped

      const first = await agent()
        .post(`/api/v1/fee-structures/${structureId}/assign`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie);
      expect(first.status).toBe(200);
      expect(first.body.assigned).toBe(2);

      const second = await agent()
        .post(`/api/v1/fee-structures/${structureId}/assign`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie);
      expect(second.body.assigned).toBe(0);
      expect(second.body.alreadyAssigned).toBe(2);
    });
  });

  describe('Payments and waiving', () => {
    async function assignFee(cookie: string, amountMinor = 500000) {
      const { academicYearId } = await setUpClassAndSection(cookie);
      const categoryId = await createCategory(cookie);
      const structureId = await createStructure(cookie, categoryId, academicYearId, undefined, amountMinor);
      const studentId = await admitStudent(cookie, undefined, 'A-1');
      const assign = await agent()
        .post(`/api/v1/students/${studentId}/fees`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ feeStructureId: structureId });
      return { studentFeeId: assign.body.id as string, studentId };
    }

    it('a partial payment marks the fee PARTIALLY_PAID with the correct balance', async () => {
      const { cookie } = await registerSchool('Partial Payment School', 'partialpayment1@example.test');
      const { studentFeeId, studentId } = await assignFee(cookie, 500000);

      const payment = await agent()
        .post(`/api/v1/student-fees/${studentFeeId}/payments`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ amountMinor: 200000, method: 'CASH' });
      expect(payment.status).toBe(201);
      expect(payment.body.receipt.receiptNo).toBeTruthy();

      const fees = await agent().get(`/api/v1/students/${studentId}/fees`).set('Cookie', cookie);
      const fee = fees.body.find((f: { id: string }) => f.id === studentFeeId);
      expect(fee.status).toBe('PARTIALLY_PAID');
      expect(fee.paidMinor).toBe(200000);
      expect(fee.balanceMinor).toBe(300000);
    });

    it('paying the full amount marks the fee PAID', async () => {
      const { cookie } = await registerSchool('Full Payment School', 'fullpayment1@example.test');
      const { studentFeeId, studentId } = await assignFee(cookie, 500000);

      await agent()
        .post(`/api/v1/student-fees/${studentFeeId}/payments`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ amountMinor: 300000, method: 'CASH' });
      await agent()
        .post(`/api/v1/student-fees/${studentFeeId}/payments`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ amountMinor: 200000, method: 'ONLINE' });

      const fees = await agent().get(`/api/v1/students/${studentId}/fees`).set('Cookie', cookie);
      const fee = fees.body.find((f: { id: string }) => f.id === studentFeeId);
      expect(fee.status).toBe('PAID');
      expect(fee.paidMinor).toBe(500000);
      expect(fee.balanceMinor).toBe(0);
    });

    it('issues sequential, unique receipt numbers across payments', async () => {
      const { cookie } = await registerSchool('Receipt School', 'receipt1@example.test');
      const { studentFeeId: feeA } = await assignFee(cookie, 500000);
      const p1 = await agent()
        .post(`/api/v1/student-fees/${feeA}/payments`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ amountMinor: 100000, method: 'CASH' });
      const p2 = await agent()
        .post(`/api/v1/student-fees/${feeA}/payments`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ amountMinor: 100000, method: 'CASH' });
      expect(p1.body.receipt.receiptNo).not.toBe(p2.body.receipt.receiptNo);
    });

    it('waives a fee and rejects further payments against it', async () => {
      const { cookie } = await registerSchool('Waive School', 'waive1@example.test');
      const { studentFeeId } = await assignFee(cookie);

      const waived = await agent()
        .patch(`/api/v1/student-fees/${studentFeeId}/waive`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie);
      expect(waived.status).toBe(200);
      expect(waived.body.status).toBe('WAIVED');

      const payment = await agent()
        .post(`/api/v1/student-fees/${studentFeeId}/payments`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ amountMinor: 100000, method: 'CASH' });
      expect(payment.status).toBe(400);
    });

    it('a freshly invited Teacher cannot record a payment (403)', async () => {
      const { cookie: directorCookie } = await registerSchool('Teacher Perm Fees', 'teacherpermfees@example.test');
      const { studentFeeId } = await assignFee(directorCookie);
      const { cookie: teacherCookie } = await inviteAndLogin(
        directorCookie,
        'Teacher',
        'noaccessfees@example.test',
        'teacher-pass-123',
      );

      const res = await agent()
        .post(`/api/v1/student-fees/${studentFeeId}/payments`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', teacherCookie)
        .send({ amountMinor: 100000, method: 'CASH' });
      expect(res.status).toBe(403);
    });

    it("404s when School B tries to record a payment on School A's student fee (cross-tenant)", async () => {
      const schoolA = await registerSchool('School A Fees', 'schoolA-fees@example.test');
      const schoolB = await registerSchool('School B Fees', 'schoolB-fees@example.test');
      const { studentFeeId } = await assignFee(schoolA.cookie);

      const res = await agent()
        .post(`/api/v1/student-fees/${studentFeeId}/payments`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', schoolB.cookie)
        .send({ amountMinor: 100000, method: 'CASH' });
      expect(res.status).toBe(404);
    });
  });

  describe('Outstanding report', () => {
    it('lists only PENDING/PARTIALLY_PAID fees with the correct balance, excluding PAID and WAIVED', async () => {
      const { cookie } = await registerSchool('Outstanding School', 'outstanding1@example.test');
      const { academicYearId } = await setUpClassAndSection(cookie);
      const categoryId = await createCategory(cookie);
      const structureId = await createStructure(cookie, categoryId, academicYearId, undefined, 500000);

      const pendingStudent = await admitStudent(cookie, undefined, 'A-1');
      const paidStudent = await admitStudent(cookie, undefined, 'A-2');
      const waivedStudent = await admitStudent(cookie, undefined, 'A-3');

      const pendingFee = await agent()
        .post(`/api/v1/students/${pendingStudent}/fees`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ feeStructureId: structureId });

      const paidFee = await agent()
        .post(`/api/v1/students/${paidStudent}/fees`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ feeStructureId: structureId });
      await agent()
        .post(`/api/v1/student-fees/${paidFee.body.id}/payments`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ amountMinor: 500000, method: 'CASH' });

      const waivedFee = await agent()
        .post(`/api/v1/students/${waivedStudent}/fees`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ feeStructureId: structureId });
      await agent()
        .patch(`/api/v1/student-fees/${waivedFee.body.id}/waive`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie);

      const outstanding = await agent().get('/api/v1/fees/outstanding').set('Cookie', cookie);
      expect(outstanding.status).toBe(200);
      const ids = outstanding.body.map((row: { id: string }) => row.id);
      expect(ids).toContain(pendingFee.body.id);
      expect(ids).not.toContain(paidFee.body.id);
      expect(ids).not.toContain(waivedFee.body.id);
      const row = outstanding.body.find((r: { id: string }) => r.id === pendingFee.body.id);
      expect(row.balanceMinor).toBe(500000);
      expect(row.student.admissionNo).toBe('A-1');
    });
  });
});
