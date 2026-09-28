import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { resetTestData } from './db-helpers';
import { permissionCatalog } from '../prisma/seed-data/permissions';

// End-to-end tests for Phase 10 (Communication): notices (draft ->
// publish), lazy read-tracking for broad-audience notices
// (docs/security-scalability-review.md F4), and in-app Notification
// rows for INDIVIDUAL-audience notices — all through the real HTTP
// stack. No new ResourceType was added for this module (every notice.*
// grant among the default roles is ALL_SCHOOL-scoped, same as
// Classes/Subjects/FeeCategories before it), so these tests focus on
// the draft/publish visibility split and the two read-tracking paths.

const WEB_ORIGIN = 'http://localhost:3000';

describe('Notices (e2e)', () => {
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
    return { cookie, userId: invite.body.userId as string };
  }

  async function createDraft(cookie: string, overrides: Record<string, unknown> = {}) {
    const res = await agent()
      .post('/api/v1/notices')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({ title: 'Holiday', body: 'School closed Friday.', audienceType: 'ALL_SCHOOL', ...overrides });
    return res;
  }

  describe('Draft / publish workflow', () => {
    it('creates a draft that is invisible to a view-only role until published', async () => {
      const { cookie: directorCookie } = await registerSchool('Notices School', 'notices1@example.test');
      const { cookie: teacherCookie } = await inviteAndLogin(
        directorCookie,
        'Teacher',
        'teacher-notices1@example.test',
        'teacher-pass-123',
      );

      const draft = await createDraft(directorCookie);
      expect(draft.status).toBe(201);
      expect(draft.body.publishedAt).toBeNull();

      const teacherList = await agent().get('/api/v1/notices').set('Cookie', teacherCookie);
      expect(teacherList.body.map((n: { id: string }) => n.id)).not.toContain(draft.body.id);

      const directorList = await agent().get('/api/v1/notices').set('Cookie', directorCookie);
      expect(directorList.body.map((n: { id: string }) => n.id)).toContain(draft.body.id);

      const publish = await agent()
        .post(`/api/v1/notices/${draft.body.id}/publish`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', directorCookie);
      expect(publish.status).toBe(200);
      expect(publish.body.publishedAt).toBeTruthy();

      const teacherListAfter = await agent().get('/api/v1/notices').set('Cookie', teacherCookie);
      expect(teacherListAfter.body.map((n: { id: string }) => n.id)).toContain(draft.body.id);
    });

    it('rejects publishing an already-published notice', async () => {
      const { cookie } = await registerSchool('Double Publish School', 'doublepublish1@example.test');
      const draft = await createDraft(cookie);
      await agent().post(`/api/v1/notices/${draft.body.id}/publish`).set('Origin', WEB_ORIGIN).set('Cookie', cookie);

      const second = await agent()
        .post(`/api/v1/notices/${draft.body.id}/publish`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie);
      expect(second.status).toBe(400);
    });

    it('a Teacher (view-only) cannot create a notice (403)', async () => {
      const { cookie: directorCookie } = await registerSchool('Teacher Perm Notices', 'teacherpermnotices@example.test');
      const { cookie: teacherCookie } = await inviteAndLogin(
        directorCookie,
        'Teacher',
        'noaccessnotices@example.test',
        'teacher-pass-123',
      );

      const res = await createDraft(teacherCookie);
      expect(res.status).toBe(403);
    });

    it("404s when School B tries to publish School A's notice (cross-tenant)", async () => {
      const schoolA = await registerSchool('School A Notices', 'schoolA-notices@example.test');
      const schoolB = await registerSchool('School B Notices', 'schoolB-notices@example.test');
      const draft = await createDraft(schoolA.cookie);

      const res = await agent()
        .post(`/api/v1/notices/${draft.body.id}/publish`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', schoolB.cookie);
      expect(res.status).toBe(404);
    });
  });

  describe('Read tracking', () => {
    it('lazily tracks reads for an ALL_SCHOOL notice via NoticeRead', async () => {
      const { cookie: directorCookie } = await registerSchool('Read Tracking School', 'readtracking1@example.test');
      const { cookie: teacherCookie } = await inviteAndLogin(
        directorCookie,
        'Teacher',
        'reader1@example.test',
        'teacher-pass-123',
      );
      const draft = await createDraft(directorCookie);
      await agent().post(`/api/v1/notices/${draft.body.id}/publish`).set('Origin', WEB_ORIGIN).set('Cookie', directorCookie);

      const before = await agent().get('/api/v1/notices').set('Cookie', teacherCookie);
      expect(before.body.find((n: { id: string }) => n.id === draft.body.id).isRead).toBe(false);

      const markRead = await agent()
        .post(`/api/v1/notices/${draft.body.id}/read`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', teacherCookie);
      expect(markRead.status).toBe(200);

      const after = await agent().get('/api/v1/notices').set('Cookie', teacherCookie);
      expect(after.body.find((n: { id: string }) => n.id === draft.body.id).isRead).toBe(true);

      // Marking read twice must not throw (idempotent upsert on the
      // NoticeRead(noticeId, userId) unique constraint).
      const markAgain = await agent()
        .post(`/api/v1/notices/${draft.body.id}/read`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', teacherCookie);
      expect(markAgain.status).toBe(200);
    });

    it('an INDIVIDUAL-audience notice creates exactly one Notification on publish, delivered to that recipient', async () => {
      const { cookie: directorCookie } = await registerSchool('Individual Notice School', 'individualnotice1@example.test');
      const { cookie: teacherCookie, userId: teacherUserId } = await inviteAndLogin(
        directorCookie,
        'Teacher',
        'targeted1@example.test',
        'teacher-pass-123',
      );

      const draft = await createDraft(directorCookie, { audienceType: 'INDIVIDUAL', audienceRefId: teacherUserId });
      expect(draft.status).toBe(201);
      await agent().post(`/api/v1/notices/${draft.body.id}/publish`).set('Origin', WEB_ORIGIN).set('Cookie', directorCookie);

      const notifications = await agent().get('/api/v1/notifications').set('Cookie', teacherCookie);
      expect(notifications.body).toHaveLength(1);
      expect(notifications.body[0].noticeId).toBe(draft.body.id);
      expect(notifications.body[0].readAt).toBeNull();

      await agent()
        .post(`/api/v1/notices/${draft.body.id}/read`)
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', teacherCookie);

      const after = await agent().get('/api/v1/notifications').set('Cookie', teacherCookie);
      expect(after.body[0].readAt).toBeTruthy();
    });

    it("rejects an INDIVIDUAL notice targeting a user with no active membership in this school", async () => {
      const { cookie } = await registerSchool('Bad Target School', 'badtarget1@example.test');
      const res = await createDraft(cookie, { audienceType: 'INDIVIDUAL', audienceRefId: 'not-a-real-user-id' });
      expect(res.status).toBe(400);
    });
  });
});
