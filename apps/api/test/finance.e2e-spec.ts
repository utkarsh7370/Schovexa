import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { resetTestData } from './db-helpers';
import { permissionCatalog } from '../prisma/seed-data/permissions';
import { currentYearDates } from './year-helpers';

// The Accountant's whole workspace, end to end through the real HTTP stack:
// what the role can and can't reach, cash-only collection, payment corrections,
// receipts, refunds and concessions (with their approval steps), fee demand and
// reminders, the ledger, the dashboard, reports and exports, the finance
// activity log, the limited student lookup — and that none of it leaks across
// schools.

const WEB_ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct-horse-battery';

describe('Accountant finance (e2e)', () => {
  let app: INestApplication;
  const db = new PrismaClient();

  beforeAll(async () => {
    for (const permission of permissionCatalog) {
      await db.permission.upsert({ where: { key: permission.key }, update: {}, create: permission });
    }
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
    // The family notice after a payment is fire-and-forget; let it finish before the data is wiped.
    await new Promise((resolve) => setTimeout(resolve, 150));
    await app.close();
  });

  const agent = () => request(app.getHttpServer());
  const post = (cookie: string, url: string, body: object = {}) => agent().post(`/api/v1${url}`).set('Origin', WEB_ORIGIN).set('Cookie', cookie).send(body);
  const patch = (cookie: string, url: string, body: object = {}) => agent().patch(`/api/v1${url}`).set('Origin', WEB_ORIGIN).set('Cookie', cookie).send(body);
  const get = (cookie: string, url: string) => agent().get(`/api/v1${url}`).set('Cookie', cookie);
  const del = (cookie: string, url: string) => agent().delete(`/api/v1${url}`).set('Origin', WEB_ORIGIN).set('Cookie', cookie);

  async function registerSchool(schoolName: string, email: string) {
    const res = await agent().post('/api/v1/schools/register').set('Origin', WEB_ORIGIN).send({ schoolName, directorFirstName: 'D', directorLastName: 'R', email, password: PASSWORD });
    return { schoolId: res.body.schoolId as string, cookie: res.headers['set-cookie'] as unknown as string };
  }

  async function loginAs(email: string) {
    const login = await agent().post('/api/v1/auth/login').set('Origin', WEB_ORIGIN).send({ email, password: PASSWORD });
    const cookie = login.headers['set-cookie'] as unknown as string;
    const me = await agent().get('/api/v1/auth/me').set('Cookie', cookie);
    await post(cookie, '/auth/select-school', { membershipId: me.body.memberships[0].membershipId });
    return cookie;
  }

  async function inviteAndLogin(directorCookie: string, roleName: string, email: string, firstName = 'T') {
    const roles = await get(directorCookie, '/roles');
    const role = roles.body.find((r: { name: string }) => r.name === roleName);
    const invite = await post(directorCookie, '/memberships/invitations', { email, firstName, lastName: 'R', roleId: role.id });
    await agent().post('/api/v1/auth/accept-invite').set('Origin', WEB_ORIGIN).send({ token: invite.body.inviteToken, password: PASSWORD });
    return loginAs(email);
  }

  interface World {
    director: string;
    accountant: string;
    principal: string;
    studentId: string;
    parentId: string;
    feeId: string;
    classId: string;
    sectionId: string;
    academicYearId: string;
    schoolId: string;
  }

  /** A school with one student (and a parent), one 5,000.00 fee assigned, an Accountant and a Principal. */
  async function world(suffix = '1', amountMinor = 500000): Promise<World> {
    const { cookie: director, schoolId } = await registerSchool(`Finance School ${suffix}`, `director${suffix}@example.test`);
    const ay = await post(director, '/academic-years', { name: '2025-26', ...currentYearDates() });
    const klass = await post(director, '/classes', { academicYearId: ay.body.id, name: 'Grade 5', order: 5 });
    const section = await post(director, `/classes/${klass.body.id}/sections`, { name: 'A' });
    const student = await post(director, '/students', { admissionNo: `A-${suffix}`, firstName: 'Kabir', lastName: 'Rao', dateOfBirth: '2015-05-05', gender: 'Male', sectionId: section.body.id });
    const parent = await post(director, '/parents', { firstName: 'Meera', lastName: 'Rao', phone: '9876543210', email: `meera${suffix}@example.test` });
    await post(director, `/students/${student.body.id}/parents`, { parentId: parent.body.id, relation: 'Mother', isPrimary: true });
    const category = await post(director, '/fee-categories', { name: 'Tuition' });
    const structure = await post(director, '/fee-structures', { feeCategoryId: category.body.id, academicYearId: ay.body.id, amountMinor, frequency: 'MONTHLY' });
    const fee = await post(director, `/students/${student.body.id}/fees`, { feeStructureId: structure.body.id });
    const accountant = await inviteAndLogin(director, 'Accountant', `accountant${suffix}@example.test`, 'Asha');
    const principal = await inviteAndLogin(director, 'Principal', `principal${suffix}@example.test`, 'Pria');
    return { director, accountant, principal, studentId: student.body.id, parentId: parent.body.id, feeId: fee.body.id, classId: klass.body.id, sectionId: section.body.id, academicYearId: ay.body.id, schoolId };
  }

  const pay = (w: World, amountMinor: number, extra: object = {}, cookie = w.accountant) => post(cookie, `/student-fees/${w.feeId}/payments`, { amountMinor, method: 'CASH', ...extra });

  describe('What the Accountant can and cannot reach', () => {
    it('has finance access', async () => {
      const w = await world();
      for (const url of ['/finance/dashboard', '/finance/config', '/payments', '/refunds', '/concessions', '/finance/demand', '/finance/reports/summary', '/finance/audit', `/students/${w.studentId}/fees`, `/students/${w.studentId}/ledger`, `/finance/students/${w.studentId}`, '/fee-structures', '/fees/outstanding']) {
        const res = await get(w.accountant, url);
        expect([url, res.status]).toEqual([url, 200]);
      }
    });

    it('has no access outside finance', async () => {
      const w = await world();
      for (const url of ['/teachers', '/memberships', '/audit-logs', '/reports/students', '/students', `/students/${w.studentId}`, `/students/${w.studentId}/photo`, '/parents', '/departments']) {
        const res = await get(w.accountant, url);
        expect([url, res.status]).toEqual([url, 403]);
      }
      expect((await patch(w.accountant, '/school-settings', { schoolDisplayName: 'x' })).status).toBe(403);
      expect((await del(w.accountant, `/students/${w.studentId}`)).status).toBe(403);
      expect((await patch(w.accountant, `/students/${w.studentId}`, { firstName: 'Hacked' })).status).toBe(403);
      expect((await post(w.accountant, '/memberships/invitations', { email: 'x@example.test', firstName: 'x', lastName: 'y', roleId: 'whatever' })).status).toBe(403);
    });

    it('cannot waive a fee (write it off) — that is a Director decision', async () => {
      const w = await world();
      const res = await patch(w.accountant, `/student-fees/${w.feeId}/waive`);
      expect(res.status).toBe(403);
      const fee = await db.studentFee.findUniqueOrThrow({ where: { id: w.feeId } });
      expect(fee.status).toBe('PENDING');
    });

    it('cannot approve refunds or large discounts, or correct old payments for any reason', async () => {
      const w = await world();
      const roles = await get(w.director, '/roles');
      const accountantRole = roles.body.find((r: { name: string }) => r.name === 'Accountant');
      const keys = await db.rolePermission.findMany({ where: { roleId: accountantRole.id }, include: { permission: true } });
      const held = keys.map((k) => k.permission.key);
      for (const forbidden of ['refund.approve', 'discount.approve', 'payment.correctAny', 'student.view', 'student.update', 'student.delete', 'teacher.view', 'fee.refund', 'role.update', 'settings.update']) {
        expect([forbidden, held.includes(forbidden)]).toEqual([forbidden, false]);
      }
    });
  });

  describe('Collecting a payment (cash only)', () => {
    it('records a cash payment and issues a receipt', async () => {
      const w = await world();
      const res = await pay(w, 200000, { receivedFrom: 'Meera Rao', reference: 'BOOK-17', note: 'First instalment' });
      expect(res.status).toBe(201);
      expect(res.body.method).toBe('CASH');
      expect(res.body.receipt.receiptNo).toMatch(/\d{6}$/);
      expect(res.body.receivedFrom).toBe('Meera Rao');
      const fees = await get(w.accountant, `/students/${w.studentId}/fees`);
      expect(fees.body[0]).toMatchObject({ status: 'PARTIALLY_PAID', paidMinor: 200000, balanceMinor: 300000, netDueMinor: 500000 });
    });

    it('defaults the method to cash when none is sent', async () => {
      const w = await world();
      const res = await post(w.accountant, `/student-fees/${w.feeId}/payments`, { amountMinor: 100000 });
      expect(res.status).toBe(201);
      expect(res.body.method).toBe('CASH');
    });

    it.each(['ONLINE', 'CHEQUE', 'BANK_TRANSFER'])('refuses %s while only cash is switched on', async (method) => {
      const w = await world();
      const res = await pay(w, 100000, { method });
      expect(res.status).toBe(400);
      expect(res.body.error?.code ?? res.body.code).toBe('PAYMENT_METHOD_NOT_ENABLED');
      expect(await db.payment.count()).toBe(0);
    });

    it('config reports cash as the only method and no online payments', async () => {
      const w = await world();
      const res = await get(w.accountant, '/finance/config');
      expect(res.body.paymentMethods).toEqual([{ value: 'CASH', label: 'Cash' }]);
      expect(res.body.onlinePaymentsEnabled).toBe(false);
    });

    it('refuses to take more than is owed, and nothing once it is paid', async () => {
      const w = await world();
      const over = await pay(w, 500001);
      expect(over.status).toBe(400);
      expect(over.body.error?.code ?? over.body.code).toBe('AMOUNT_EXCEEDS_BALANCE');
      expect((await pay(w, 500000)).status).toBe(201);
      const again = await pay(w, 100);
      expect(again.status).toBe(400);
      expect(again.body.error?.code ?? again.body.code).toBe('NOTHING_OWED');
      const fees = await get(w.accountant, `/students/${w.studentId}/fees`);
      expect(fees.body[0]).toMatchObject({ status: 'PAID', balanceMinor: 0 });
    });

    it('insists on full payment when the school does not accept part payments', async () => {
      const w = await world();
      expect((await patch(w.director, '/school-settings', { allowPartialPayments: false })).status).toBe(200);
      const part = await pay(w, 100000);
      expect(part.status).toBe(400);
      expect(part.body.error?.code ?? part.body.code).toBe('PARTIAL_PAYMENT_NOT_ALLOWED');
      expect((await pay(w, 500000)).status).toBe(201);
    });

    it('tells the family: an in-app notice and a logged attempt for each channel', async () => {
      const w = await world();
      await pay(w, 100000);
      await new Promise((resolve) => setTimeout(resolve, 200));
      const rows = await db.feeReminder.findMany({ where: { kind: 'PAYMENT_CONFIRMATION' } });
      expect(rows.length).toBeGreaterThan(0);
      // The parent has no portal account and mail isn't configured in tests, so both are skipped — and say why.
      expect(rows.every((r) => r.status === 'SKIPPED' && !!r.detail)).toBe(true);
    });
  });

  describe('Correcting a payment', () => {
    it('needs a reason, keeps the old values in the audit log and updates the balance', async () => {
      const w = await world();
      const paid = await pay(w, 200000);
      const noReason = await patch(w.accountant, `/payments/${paid.body.id}`, { amountMinor: 250000 });
      expect(noReason.status).toBe(400);

      const fixed = await patch(w.accountant, `/payments/${paid.body.id}`, { amountMinor: 250000, reason: 'Typed 2,000 instead of 2,500' });
      expect(fixed.status).toBe(200);
      expect(fixed.body).toMatchObject({ amountMinor: 250000, corrected: true, correctionReason: 'Typed 2,000 instead of 2,500' });

      const fees = await get(w.accountant, `/students/${w.studentId}/fees`);
      expect(fees.body[0]).toMatchObject({ paidMinor: 250000, balanceMinor: 250000 });
      const log = await db.auditLog.findFirstOrThrow({ where: { action: 'payment.corrected' } });
      expect(log.metadata).toMatchObject({ reason: 'Typed 2,000 instead of 2,500', before: { amountMinor: 200000 }, after: { amountMinor: 250000 } });
    });

    it('cannot push the total paid above what is owed', async () => {
      const w = await world();
      const paid = await pay(w, 200000);
      const res = await patch(w.accountant, `/payments/${paid.body.id}`, { amountMinor: 600000, reason: 'Fat finger' });
      expect(res.status).toBe(400);
    });

    it('is locked after the correction window for an Accountant, but not for the Principal', async () => {
      const w = await world();
      const paid = await pay(w, 200000);
      await db.payment.update({ where: { id: paid.body.id }, data: { createdAt: new Date(Date.now() - 5 * 86_400_000) } });
      const late = await patch(w.accountant, `/payments/${paid.body.id}`, { note: 'Late fix', reason: 'Adding a note later' });
      expect(late.status).toBe(403);
      expect(late.body.error?.code ?? late.body.code).toBe('CORRECTION_WINDOW_PASSED');
      const ok = await patch(w.principal, `/payments/${paid.body.id}`, { note: 'Late fix', reason: 'Adding a note later' });
      expect(ok.status).toBe(200);
    });

    it('cannot change the amount of a payment that has a refund against it', async () => {
      const w = await world();
      const paid = await pay(w, 200000);
      await post(w.accountant, '/refunds', { paymentId: paid.body.id, amountMinor: 50000, reason: 'Paid twice by mistake' });
      const res = await patch(w.accountant, `/payments/${paid.body.id}`, { amountMinor: 150000, reason: 'Trying to hide it' });
      expect(res.status).toBe(400);
      expect(res.body.error?.code ?? res.body.code).toBe('PAYMENT_HAS_REFUNDS');
    });
  });

  describe('Receipts', () => {
    it('shows a receipt, downloads a PDF, counts reprints and logs them', async () => {
      const w = await world();
      const paid = await pay(w, 200000, { reference: 'BOOK-17' });
      const id = paid.body.receipt.id as string;

      const view = await get(w.accountant, `/receipts/${id}`);
      expect(view.status).toBe(200);
      expect(view.body).toMatchObject({
        receiptNo: paid.body.receipt.receiptNo,
        student: { admissionNo: 'A-1', name: 'Kabir Rao', parentName: 'Meera Rao' },
        fee: { category: 'Tuition' },
        payment: { amountMinor: 200000, method: 'CASH', reference: 'BOOK-17' },
        balanceMinor: 300000,
      });

      const pdf = await get(w.accountant, `/receipts/${id}/pdf`).buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

      const first = await post(w.accountant, `/receipts/${id}/reprint`);
      const second = await post(w.accountant, `/receipts/${id}/reprint`);
      expect([first.body.reprintCount, second.body.reprintCount]).toEqual([1, 2]);
      expect(await db.auditLog.count({ where: { action: 'receipt.reprinted' } })).toBe(2);
      expect(await db.auditLog.count({ where: { action: 'receipt.downloaded' } })).toBe(1);

      const sent = await post(w.accountant, `/receipts/${id}/notify`);
      expect(sent.status).toBe(201);
      expect(await db.auditLog.count({ where: { action: 'receipt.sent' } })).toBe(1);
    });

    it('lets a parent see the receipt for their own child — and nobody else’s', async () => {
      const w = await world();
      const paid = await pay(w, 200000);
      const invite = await post(w.director, `/parents/${w.parentId}/invite`, { email: 'meera-portal@example.test' });
      await agent().post('/api/v1/auth/accept-invite').set('Origin', WEB_ORIGIN).send({ token: invite.body.inviteToken, password: PASSWORD });
      const parent = await loginAs('meera-portal@example.test');
      expect((await get(parent, `/receipts/${paid.body.receipt.id}`)).status).toBe(200);
      // Parents can read receipts, but not the school-wide money screens.
      expect((await get(parent, '/payments')).status).toBe(403);
      expect((await get(parent, '/finance/dashboard')).status).toBe(403);

      const other = await db.student.create({ data: { schoolId: w.schoolId, admissionNo: 'Z-9', firstName: 'Other', lastName: 'Child' } });
      const structure = await db.feeStructure.findFirstOrThrow({ where: { schoolId: w.schoolId } });
      const otherFee = await db.studentFee.create({ data: { schoolId: w.schoolId, studentId: other.id, feeStructureId: structure.id, amountDueMinor: 100000 } });
      const otherPay = await post(w.accountant, `/student-fees/${otherFee.id}/payments`, { amountMinor: 100000, method: 'CASH' });
      expect((await get(parent, `/receipts/${otherPay.body.receipt.id}`)).status).toBe(404);
    });

    it('does not show another school’s receipt', async () => {
      const a = await world('1');
      const b = await world('2');
      const paid = await pay(a, 100000);
      expect((await get(b.accountant, `/receipts/${paid.body.receipt.id}`)).status).toBe(404);
      expect((await get(b.accountant, `/receipts/${paid.body.receipt.id}/pdf`)).status).toBe(404);
      expect((await post(b.accountant, `/receipts/${paid.body.receipt.id}/reprint`)).status).toBe(404);
    });
  });

  describe('Refunds', () => {
    it('goes request → approval → payout, and only then changes the balance', async () => {
      const w = await world();
      const paid = await pay(w, 300000);
      const req = await post(w.accountant, '/refunds', { paymentId: paid.body.id, amountMinor: 100000, reason: 'Child left the school' });
      expect(req.status).toBe(201);
      expect(req.body.status).toBe('REQUESTED');

      // The accountant can neither approve nor pay out an unapproved refund.
      expect((await post(w.accountant, `/refunds/${req.body.id}/approve`)).status).toBe(403);
      const early = await post(w.accountant, `/refunds/${req.body.id}/process`);
      expect(early.status).toBe(409);

      expect((await post(w.principal, `/refunds/${req.body.id}/approve`, { note: 'OK' })).status).toBe(201);
      let fees = await get(w.accountant, `/students/${w.studentId}/fees`);
      expect(fees.body[0].balanceMinor).toBe(200000); // nothing has moved yet

      const processed = await post(w.accountant, `/refunds/${req.body.id}/process`);
      expect(processed.status).toBe(201);
      expect(processed.body).toMatchObject({ status: 'PROCESSED', processedBy: expect.any(String) });
      fees = await get(w.accountant, `/students/${w.studentId}/fees`);
      expect(fees.body[0]).toMatchObject({ paidMinor: 200000, refundedMinor: 100000, balanceMinor: 300000, status: 'PARTIALLY_PAID' });

      const actions = (await db.auditLog.findMany({ where: { module: 'refund' }, orderBy: { createdAt: 'asc' } })).map((l) => l.action);
      expect(actions).toEqual(['refund.requested', 'refund.approved', 'refund.processed']);
    });

    it('cannot refund more than was paid, counting refunds already asked for', async () => {
      const w = await world();
      const paid = await pay(w, 100000);
      expect((await post(w.accountant, '/refunds', { paymentId: paid.body.id, amountMinor: 100001, reason: 'Too much' })).status).toBe(400);
      expect((await post(w.accountant, '/refunds', { paymentId: paid.body.id, amountMinor: 60000, reason: 'Part of it' })).status).toBe(201);
      const second = await post(w.accountant, '/refunds', { paymentId: paid.body.id, amountMinor: 60000, reason: 'Another part' });
      expect(second.status).toBe(400);
      expect(second.body.error?.code ?? second.body.code).toBe('REFUND_EXCEEDS_PAYMENT');
    });

    it('nobody approves their own request', async () => {
      const w = await world();
      const payment = await pay(w, 100000);
      const req = await post(w.principal, '/refunds', { paymentId: payment.body.id, amountMinor: 10000, reason: 'Principal asked' });
      expect(req.status).toBe(201);
      const own = await post(w.principal, `/refunds/${req.body.id}/approve`);
      expect(own.status).toBe(403);
      expect(own.body.error?.code ?? own.body.code).toBe('CANNOT_APPROVE_OWN');
      // The Director can.
      expect((await post(w.director, `/refunds/${req.body.id}/approve`)).status).toBe(201);
    });

    it('can be rejected with a reason, or withdrawn by whoever asked', async () => {
      const w = await world();
      const paid = await pay(w, 200000);
      const a = await post(w.accountant, '/refunds', { paymentId: paid.body.id, amountMinor: 10000, reason: 'First try' });
      const b = await post(w.accountant, '/refunds', { paymentId: paid.body.id, amountMinor: 10000, reason: 'Second try' });
      expect((await post(w.principal, `/refunds/${a.body.id}/reject`, {})).status).toBe(400); // a reason is required
      const rejected = await post(w.principal, `/refunds/${a.body.id}/reject`, { note: 'Not eligible' });
      expect(rejected.body).toMatchObject({ status: 'REJECTED', decisionNote: 'Not eligible' });
      expect((await post(w.principal, `/refunds/${b.body.id}/withdraw`)).status).toBe(403);
      expect((await post(w.accountant, `/refunds/${b.body.id}/withdraw`)).body.status).toBe('REJECTED');
      expect((await post(w.accountant, `/refunds/${a.body.id}/process`)).status).toBe(409);
    });

    it('is invisible across schools', async () => {
      const a = await world('1');
      const b = await world('2');
      const paid = await pay(a, 100000);
      expect((await post(b.accountant, '/refunds', { paymentId: paid.body.id, amountMinor: 100, reason: 'Not mine to refund' })).status).toBe(404);
      const req = await post(a.accountant, '/refunds', { paymentId: paid.body.id, amountMinor: 100, reason: 'Mine to refund' });
      expect((await post(b.principal, `/refunds/${req.body.id}/approve`)).status).toBe(404);
      expect((await get(b.accountant, '/refunds')).body.data).toHaveLength(0);
    });
  });

  describe('Discounts, scholarships and concessions', () => {
    it('lets the accountant apply a small discount straight away', async () => {
      const w = await world();
      // The school's limit is 5% of the fee: 250.00 on a 5,000.00 fee.
      const res = await post(w.accountant, '/concessions', { studentFeeId: w.feeId, kind: 'DISCOUNT', name: 'Sibling discount', amountMinor: 25000, reason: 'Second child at the school' });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('APPLIED');
      const fees = await get(w.accountant, `/students/${w.studentId}/fees`);
      expect(fees.body[0]).toMatchObject({ discountMinor: 25000, netDueMinor: 475000, balanceMinor: 475000 });
    });

    it('counts small discounts together, so they cannot be used to get round the limit', async () => {
      const w = await world();
      expect((await post(w.accountant, '/concessions', { studentFeeId: w.feeId, name: 'First', amountMinor: 20000, reason: 'Small one' })).body.status).toBe('APPLIED');
      const second = await post(w.accountant, '/concessions', { studentFeeId: w.feeId, name: 'Second', amountMinor: 20000, reason: 'Another small one' });
      expect(second.body.status).toBe('REQUESTED');
    });

    it('needs approval above the limit: request → approve → apply', async () => {
      const w = await world();
      const req = await post(w.accountant, '/concessions', { studentFeeId: w.feeId, kind: 'DISCOUNT', name: 'Staff child', amountMinor: 100000, reason: 'Child of a teacher' });
      expect(req.body.status).toBe('REQUESTED');
      expect((await post(w.accountant, `/concessions/${req.body.id}/approve`)).status).toBe(403);
      expect((await post(w.accountant, `/concessions/${req.body.id}/apply`)).status).toBe(409);
      expect((await post(w.principal, `/concessions/${req.body.id}/approve`, { note: 'Fine' })).body.status).toBe('APPROVED');
      let fees = await get(w.accountant, `/students/${w.studentId}/fees`);
      expect(fees.body[0].discountMinor).toBe(0);
      expect((await post(w.accountant, `/concessions/${req.body.id}/apply`)).body.status).toBe('APPLIED');
      fees = await get(w.accountant, `/students/${w.studentId}/fees`);
      expect(fees.body[0]).toMatchObject({ discountMinor: 100000, balanceMinor: 400000 });
    });

    it('always needs approval for a scholarship, however small', async () => {
      const w = await world();
      const res = await post(w.accountant, '/concessions', { studentFeeId: w.feeId, kind: 'SCHOLARSHIP', name: 'Merit scholarship', amountMinor: 100, reason: 'Top of the class' });
      expect(res.body.status).toBe('REQUESTED');
    });

    it('lets the Director sign off and apply in one step', async () => {
      const w = await world();
      const res = await post(w.director, '/concessions', { studentFeeId: w.feeId, kind: 'SCHOLARSHIP', name: 'Founder’s scholarship', amountMinor: 200000, reason: 'Awarded by the Director' });
      expect(res.body.status).toBe('APPLIED');
      expect(res.body.decidedBy).toBeTruthy();
    });

    it('nobody approves their own request, and a rejected one never touches the fee', async () => {
      const w = await world();
      const own = await post(w.principal, '/concessions', { studentFeeId: w.feeId, kind: 'CONCESSION', name: 'Hardship', amountMinor: 50000, reason: 'Family hardship' });
      // The Principal holds approve and apply, so this was applied at once — ask the Accountant for one that waits.
      expect(own.body.status).toBe('APPLIED');
      const w2 = await world('2');
      const waiting = await post(w2.accountant, '/concessions', { studentFeeId: w2.feeId, kind: 'CONCESSION', name: 'Hardship', amountMinor: 50000, reason: 'Family hardship' });
      const rejected = await post(w2.principal, `/concessions/${waiting.body.id}/reject`, { note: 'Not enough evidence' });
      expect(rejected.body.status).toBe('REJECTED');
      const fees = await get(w2.accountant, `/students/${w2.studentId}/fees`);
      expect(fees.body[0].discountMinor).toBe(0);
      expect((await post(w2.principal, `/concessions/${waiting.body.id}/apply`)).status).toBe(409);
    });

    it('cannot be worth more than what is still owed, or go on a paid fee', async () => {
      const w = await world();
      const over = await post(w.director, '/concessions', { studentFeeId: w.feeId, name: 'Too big', amountMinor: 500001, reason: 'Way too much' });
      expect(over.status).toBe(400);
      expect(over.body.error?.code ?? over.body.code).toBe('CONCESSION_EXCEEDS_BALANCE');
      await pay(w, 500000);
      expect((await post(w.director, '/concessions', { studentFeeId: w.feeId, name: 'Too late', amountMinor: 100, reason: 'It is paid already' })).status).toBe(400);
    });

    it('lets payment only cover the discounted amount', async () => {
      const w = await world();
      await post(w.director, '/concessions', { studentFeeId: w.feeId, name: 'Scholarship', kind: 'SCHOLARSHIP', amountMinor: 100000, reason: 'Merit award' });
      expect((await pay(w, 400001)).status).toBe(400);
      expect((await pay(w, 400000)).status).toBe(201);
      const fees = await get(w.accountant, `/students/${w.studentId}/fees`);
      expect(fees.body[0]).toMatchObject({ status: 'PAID', balanceMinor: 0 });
    });
  });

  describe('Ledger, fee demand and reminders', () => {
    it('builds a ledger with a running balance', async () => {
      const w = await world();
      await post(w.director, '/concessions', { studentFeeId: w.feeId, name: 'Scholarship', kind: 'SCHOLARSHIP', amountMinor: 100000, reason: 'Merit award' });
      const paid = await pay(w, 150000);
      await post(w.accountant, '/refunds', { paymentId: paid.body.id, amountMinor: 50000, reason: 'Overcharged' }).then((r) => post(w.principal, `/refunds/${r.body.id}/approve`).then(() => post(w.accountant, `/refunds/${r.body.id}/process`)));
      const res = await get(w.accountant, `/students/${w.studentId}/ledger`);
      expect(res.status).toBe(200);
      expect(res.body.entries.map((e: { type: string }) => e.type)).toEqual(['CHARGE', 'DISCOUNT', 'PAYMENT', 'REFUND']);
      expect(res.body.entries.map((e: { balanceMinor: number }) => e.balanceMinor)).toEqual([500000, 400000, 250000, 300000]);
      expect(res.body.totals).toEqual({ billedMinor: 500000, discountsMinor: 100000, paidMinor: 150000, refundedMinor: 50000, balanceMinor: 300000 });
    });

    it('lists who owes what, and prints a demand statement', async () => {
      const w = await world();
      await pay(w, 100000);
      const demand = await get(w.accountant, '/finance/demand');
      expect(demand.body.totals).toMatchObject({ students: 1, totalMinor: 400000 });
      expect(demand.body.data[0]).toMatchObject({ admissionNo: 'A-1', parentName: 'Meera Rao', parentPhone: '9876543210', totalMinor: 400000 });
      const pdf = await get(w.accountant, `/finance/demand/${w.studentId}/pdf`).buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(pdf.status).toBe(200);
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('sends reminders once a day per fee, reports who was reached, and logs every attempt', async () => {
      const w = await world();
      const first = await post(w.accountant, '/finance/reminders', { kind: 'OUTSTANDING', classId: w.classId });
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({ fees: 1, alreadyReminded: 0 });
      // The parent has no portal account and mail isn't set up, so nobody could be reached — and that is said, not hidden.
      expect(first.body.parentsUnreachable).toBe(1);
      const rows = await db.feeReminder.findMany({ where: { kind: 'OUTSTANDING' } });
      expect(rows.map((r) => r.channel).sort()).toEqual(['EMAIL', 'IN_APP']);
      expect(rows.every((r) => r.status === 'SKIPPED' && r.detail)).toBe(true);

      const log = await get(w.accountant, '/finance/reminders');
      expect(log.body.total).toBe(2);
    });

    it('reaches a parent who has a portal account, and does not repeat inside 24 hours', async () => {
      const w = await world();
      const invite = await post(w.director, `/parents/${w.parentId}/invite`, { email: 'meera-portal@example.test' });
      await agent().post('/api/v1/auth/accept-invite').set('Origin', WEB_ORIGIN).send({ token: invite.body.inviteToken, password: PASSWORD });
      const first = await post(w.accountant, '/finance/reminders', { kind: 'OUTSTANDING', studentFeeIds: [w.feeId] });
      expect(first.body).toMatchObject({ parentsReached: 1, parentsUnreachable: 0 });
      const parentCookie = await loginAs('meera-portal@example.test');
      const notices = await get(parentCookie, '/notifications');
      expect(JSON.stringify(notices.body)).toContain('Outstanding fee for Kabir');

      const second = await post(w.accountant, '/finance/reminders', { kind: 'OUTSTANDING', studentFeeIds: [w.feeId] });
      expect(second.body).toMatchObject({ alreadyReminded: 1, parentsReached: 0 });
    });

    it('respects a parent who turned in-app notices off', async () => {
      const w = await world();
      const invite = await post(w.director, `/parents/${w.parentId}/invite`, { email: 'meera-portal@example.test' });
      await agent().post('/api/v1/auth/accept-invite').set('Origin', WEB_ORIGIN).send({ token: invite.body.inviteToken, password: PASSWORD });
      const parentCookie = await loginAs('meera-portal@example.test');
      expect((await patch(parentCookie, '/me/profile', { firstName: 'Meera', lastName: 'Rao', notifyInApp: false, notifyByEmail: false })).status).toBe(200);
      await post(w.accountant, '/finance/reminders', { kind: 'OUTSTANDING', studentFeeIds: [w.feeId] });
      const notices = await get(parentCookie, '/notifications');
      expect(JSON.stringify(notices.body)).not.toContain('Outstanding fee for Kabir');
    });

    it('only reminds about overdue fees for an overdue reminder', async () => {
      const w = await world();
      const none = await post(w.accountant, '/finance/reminders', { kind: 'OVERDUE', studentFeeIds: [w.feeId] });
      expect(none.body.fees).toBe(0);
      await db.studentFee.update({ where: { id: w.feeId }, data: { dueDate: new Date('2020-01-01') } });
      const some = await post(w.accountant, '/finance/reminders', { kind: 'OVERDUE', studentFeeIds: [w.feeId] });
      expect(some.body.fees).toBe(1);
    });

    it('will not remind about fees in another school', async () => {
      const a = await world('1');
      const b = await world('2');
      const res = await post(b.accountant, '/finance/reminders', { kind: 'OUTSTANDING', studentFeeIds: [a.feeId] });
      expect(res.status).toBe(400);
      expect(await db.feeReminder.count()).toBe(0);
    });
  });

  describe('Dashboard', () => {
    it('adds up today’s collection, outstanding, overdue and pending work', async () => {
      const w = await world();
      await pay(w, 200000);
      const paid = await pay(w, 100000);
      await db.studentFee.update({ where: { id: w.feeId }, data: { dueDate: new Date('2020-01-01') } });
      await post(w.accountant, '/refunds', { paymentId: paid.body.id, amountMinor: 1000, reason: 'Waiting for approval' });
      await post(w.accountant, '/concessions', { studentFeeId: w.feeId, kind: 'SCHOLARSHIP', name: 'Waiting', amountMinor: 1000, reason: 'Waiting for approval' });

      const res = await get(w.accountant, '/finance/dashboard');
      expect(res.status).toBe(200);
      expect(res.body.collection).toMatchObject({ todayMinor: 300000, todayCount: 2, monthMinor: 300000, totalMinor: 300000 });
      expect(res.body.outstanding).toMatchObject({ totalMinor: 200000, fees: 1 });
      expect(res.body.overdue).toMatchObject({ totalMinor: 200000, fees: 1 });
      expect(res.body.pendingPayments).toEqual({ pending: 0, partiallyPaid: 1 });
      expect(res.body.refunds).toMatchObject({ requested: 1, requestedMinor: 1000 });
      expect(res.body.pendingConcessions).toBe(1);
      expect(res.body.recentTransactions).toHaveLength(2);
      expect(res.body.recentTransactions[0]).toMatchObject({ studentName: 'Kabir Rao', collectedBy: expect.stringContaining('Asha') });
      expect(res.body.trend).toHaveLength(14);
      expect(res.body.trend[13].amountMinor).toBe(300000);
      expect(res.body.paymentFailures.enabled).toBe(false);
    });

    it('is closed to teachers, parents and other schools’ staff', async () => {
      const w = await world('1');
      const teacher = await inviteAndLogin(w.director, 'Teacher', 'teacher1@example.test');
      expect((await get(teacher, '/finance/dashboard')).status).toBe(403);
      expect((await get(teacher, '/payments')).status).toBe(403);
      const b = await world('2');
      await pay(w, 100000);
      const other = await get(b.accountant, '/finance/dashboard');
      expect(other.body.collection.todayMinor).toBe(0);
      expect(other.body.recentTransactions).toHaveLength(0);
    });
  });

  describe('Transactions', () => {
    it('lists payments with filters and a total', async () => {
      const w = await world();
      await pay(w, 200000, { reference: 'BOOK-1' });
      await pay(w, 100000, { reference: 'BOOK-2' });
      const all = await get(w.accountant, '/payments');
      expect(all.body.data).toHaveLength(2);
      expect(all.body.totalMinor).toBe(300000);
      expect((await get(w.accountant, '/payments?search=BOOK-2')).body.data).toHaveLength(1);
      expect((await get(w.accountant, '/payments?search=Kabir')).body.data).toHaveLength(2);
      expect((await get(w.accountant, '/payments?method=CHEQUE')).body.data).toHaveLength(0);
      expect((await get(w.accountant, `/payments?classId=${w.classId}`)).body.data).toHaveLength(2);
      expect((await get(w.accountant, '/payments?from=2020-01-01&to=2020-01-02')).body.data).toHaveLength(0);
      expect((await get(w.accountant, '/payments?from=nonsense')).status).toBe(400);
      const detail = await get(w.accountant, `/payments/${all.body.data[0].id}`);
      expect(detail.body.student.admissionNo).toBe('A-1');
    });
  });

  describe('Reports and exports', () => {
    it('runs every report', async () => {
      const w = await world();
      await pay(w, 200000);
      for (const kind of ['daily-collection', 'monthly-collection', 'by-class', 'by-section', 'outstanding', 'overdue', 'payment-method', 'cash-collection', 'online-payments', 'failed-payments', 'refunds', 'concessions', 'scholarships', 'summary', 'transactions']) {
        const res = await get(w.accountant, `/finance/reports/${kind}`);
        expect([kind, res.status]).toEqual([kind, 200]);
        expect(res.body.columns.length).toBeGreaterThan(0);
      }
      expect((await get(w.accountant, '/finance/reports/made-up')).status).toBe(400);
    });

    it('gets the numbers right', async () => {
      const w = await world();
      await pay(w, 200000);
      await pay(w, 100000);
      const summary = await get(w.accountant, '/finance/reports/summary');
      const row = (m: string) => summary.body.rows.find((r: { metric: string }) => r.metric === m);
      expect(row('Payments received')).toMatchObject({ count: 2, amountMinor: 300000 });
      expect(row('Net collection').amountMinor).toBe(300000);
      expect(row('Outstanding now').amountMinor).toBe(200000);
      const method = await get(w.accountant, '/finance/reports/payment-method');
      expect(method.body.rows).toEqual([{ method: 'Cash', count: 2, amountMinor: 300000 }]);
      const byClass = await get(w.accountant, '/finance/reports/by-class');
      expect(byClass.body.rows[0]).toMatchObject({ name: 'Grade 5', students: 1, billedMinor: 500000, collectedMinor: 300000, outstandingMinor: 200000 });
      const outstanding = await get(w.accountant, '/finance/reports/outstanding');
      expect(outstanding.body.totals.find((t: { label: string }) => t.label === 'Total outstanding').value).toBe(200000);
    });

    it('says plainly that online and failed payments have nothing to show', async () => {
      const w = await world();
      for (const kind of ['online-payments', 'failed-payments']) {
        const res = await get(w.accountant, `/finance/reports/${kind}`);
        expect(res.body.rows).toEqual([]);
        expect(res.body.note).toMatch(/aren’t switched on/);
      }
    });

    it.each([
      ['csv', 'text/csv'],
      ['xlsx', 'spreadsheetml'],
      ['pdf', 'application/pdf'],
    ])('exports %s and logs it', async (format, contentType) => {
      const w = await world();
      await pay(w, 200000);
      const res = await get(w.accountant, `/finance/reports/transactions/export?format=${format}`).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain(contentType);
      expect(res.headers['content-disposition']).toContain(`.${format}`);
      const body = res.body as Buffer;
      if (format === 'csv') {
        const text = body.toString('utf-8');
        expect(text.split('\r\n')[0]).toContain('Receipt no.');
        expect(text).toContain('Kabir Rao');
        expect(text).toContain('2000'); // 2,000.00 in rupees, not paise
      }
      if (format === 'xlsx') expect(body.subarray(0, 2).toString()).toBe('PK');
      if (format === 'pdf') expect(body.subarray(0, 5).toString()).toBe('%PDF-');
      const log = await db.auditLog.findFirstOrThrow({ where: { action: 'finance.export' } });
      expect(log.metadata).toMatchObject({ report: 'transactions', format, rows: 1 });
    });

    it('neutralises spreadsheet formulas in exported text', async () => {
      const w = await world();
      await db.student.update({ where: { id: w.studentId }, data: { firstName: '=HYPERLINK("http://evil")' } });
      await pay(w, 100000);
      const res = await get(w.accountant, '/finance/reports/transactions/export?format=csv');
      expect(res.text).toContain("'=HYPERLINK");
      expect(res.text).not.toMatch(/,=HYPERLINK/);
    });

    it('refuses an unknown format, and anyone without export permission', async () => {
      const w = await world();
      expect((await get(w.accountant, '/finance/reports/transactions/export?format=exe')).status).toBe(400);
      const teacher = await inviteAndLogin(w.director, 'Teacher', 'teacher1@example.test');
      expect((await get(teacher, '/finance/reports/transactions')).status).toBe(403);
      expect((await get(teacher, '/finance/reports/transactions/export?format=csv')).status).toBe(403);
      expect(await db.auditLog.count({ where: { action: 'finance.export' } })).toBe(0);
    });

    it('keeps reports inside the school', async () => {
      const a = await world('1');
      const b = await world('2');
      await pay(a, 100000);
      const res = await get(b.accountant, '/finance/reports/transactions');
      expect(res.body.rows).toEqual([]);
    });
  });

  describe('Finance activity log', () => {
    it('shows finance activity only — not sign-ins or role changes', async () => {
      const w = await world();
      await pay(w, 100000);
      const res = await get(w.accountant, '/finance/audit');
      expect(res.status).toBe(200);
      const actions: string[] = res.body.data.map((r: { action: string }) => r.action);
      expect(actions).toContain('payment.recorded');
      expect(res.body.data.every((r: { module: string }) => res.body.modules.includes(r.module))).toBe(true);
      expect(actions.some((a) => a.startsWith('auth.') || a.startsWith('role.') || a.startsWith('membership.'))).toBe(false);
      // It cannot be widened to other modules by asking.
      const asked = await get(w.accountant, '/finance/audit?module=auth');
      expect(asked.body.data.every((r: { module: string }) => res.body.modules.includes(r.module))).toBe(true);
      // And the general audit log stays closed.
      expect((await get(w.accountant, '/audit-logs')).status).toBe(403);
    });

    it('does not show another school’s activity', async () => {
      const a = await world('1');
      const b = await world('2');
      await pay(a, 100000);
      const res = await get(b.accountant, '/finance/audit');
      expect(res.body.data.map((r: { action: string }) => r.action)).not.toContain('payment.recorded');
    });
  });

  describe('Limited student lookup', () => {
    it('finds a student by name, admission number or parent, with only what finance needs', async () => {
      const w = await world();
      for (const term of ['Kabir', 'A-1', 'Meera', '9876543210']) {
        const res = await get(w.accountant, `/finance/students?search=${encodeURIComponent(term)}`);
        expect([term, res.body.data.length]).toEqual([term, 1]);
      }
      const found = (await get(w.accountant, '/finance/students?search=Kabir')).body.data[0];
      expect(found).toMatchObject({ admissionNo: 'A-1', name: 'Kabir Rao', className: 'Grade 5', sectionName: 'A', status: 'ENROLLED', balanceMinor: 500000 });
      expect((await get(w.accountant, '/finance/students?search=')).body.data).toEqual([]);
    });

    it('shows identity, class, parents’ contact and the fee picture — never date of birth or gender', async () => {
      const w = await world();
      await pay(w, 200000);
      const res = await get(w.accountant, `/finance/students/${w.studentId}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        admissionNo: 'A-1',
        name: 'Kabir Rao',
        className: 'Grade 5',
        parents: [{ name: 'Meera Rao', relation: 'Mother', phone: '9876543210', email: 'meera1@example.test' }],
        summary: { netDueMinor: 500000, paidMinor: 200000, balanceMinor: 300000 },
      });
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('2015-05-05');
      expect(res.body.dateOfBirth).toBeUndefined();
      expect(res.body.gender).toBeUndefined();
      expect(res.body.userId).toBeUndefined();
    });

    it('stays inside the school', async () => {
      const a = await world('1');
      const b = await world('2');
      expect((await get(b.accountant, `/finance/students/${a.studentId}`)).status).toBe(404);
      expect((await get(b.accountant, `/students/${a.studentId}/ledger`)).status).toBe(404);
      expect((await get(b.accountant, `/students/${a.studentId}/fees`)).status).toBe(404);
      expect((await get(b.accountant, '/finance/students?search=Kabir')).body.data.map((s: { admissionNo: string }) => s.admissionNo)).toEqual(['A-2']);
    });

    it('serves a student photo to finance without opening the student record', async () => {
      const w = await world();
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
      const up = await agent().post(`/api/v1/students/${w.studentId}/photo`).set('Origin', WEB_ORIGIN).set('Cookie', w.director).attach('file', png, { filename: 'kid.png', contentType: 'image/png' });
      expect(up.status).toBe(201);
      expect(up.body.photoUrl).toBe(`/students/${w.studentId}/photo`);

      // The accountant can neither upload nor read through the student route…
      expect((await agent().post(`/api/v1/students/${w.studentId}/photo`).set('Origin', WEB_ORIGIN).set('Cookie', w.accountant).attach('file', png, { filename: 'kid.png', contentType: 'image/png' })).status).toBe(403);
      expect((await get(w.accountant, `/students/${w.studentId}/photo`)).status).toBe(403);
      // …but sees the picture through the finance lookup.
      const lookup = await get(w.accountant, `/finance/students/${w.studentId}`);
      expect(lookup.body.photoUrl).toBe(`/finance/students/${w.studentId}/photo`);
      const photo = await get(w.accountant, `/finance/students/${w.studentId}/photo`).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(photo.status).toBe(200);
      expect(photo.headers['content-type']).toBe('image/png');

      // The storage key is never exposed.
      const student = await get(w.director, `/students/${w.studentId}`);
      expect(student.body.photoKey).toBeUndefined();
      expect(student.body.photoUrl).toBe(`/students/${w.studentId}/photo`);
    });

    it('refuses a photo that is not really an image', async () => {
      const w = await world();
      const res = await agent().post(`/api/v1/students/${w.studentId}/photo`).set('Origin', WEB_ORIGIN).set('Cookie', w.director).attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'kid.png', contentType: 'image/png' });
      expect(res.status).toBe(400);
    });
  });
});
