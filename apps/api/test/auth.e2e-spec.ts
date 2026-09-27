import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetAuthTestData } from './db-helpers';

// End-to-end tests through the real HTTP stack (guards, middleware,
// pipes, exception filter) — verifies things a service-level unit test
// cannot: cookie attributes, CORS/origin enforcement, and the exact
// status codes a client receives, per docs/authentication.md §11 and
// docs/api.md §4.

const WEB_ORIGIN = 'http://localhost:3000';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    // AppModule wires HttpExceptionFilter itself via APP_FILTER — nothing
    // further to register here; the app already behaves as in production.
    await app.init();
    prisma = moduleRef.get(PrismaService);
    authService = moduleRef.get(AuthService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetAuthTestData(prisma);
  });

  const agent = () => request(app.getHttpServer());

  async function seedActiveUser(email: string, password: string) {
    const passwordHash = await authService.hashPassword(password);
    return prisma.user.create({
      data: { email, firstName: 'T', lastName: 'U', status: 'ACTIVE', passwordHash },
    });
  }

  describe('CSRF / origin enforcement', () => {
    it('rejects a state-changing request with no Origin header', async () => {
      await seedActiveUser('origin@example.test', 'correct-horse-battery');
      const res = await agent().post('/api/v1/auth/login').send({
        email: 'origin@example.test',
        password: 'correct-horse-battery',
      });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects a state-changing request from a disallowed Origin', async () => {
      const res = await agent()
        .post('/api/v1/auth/login')
        .set('Origin', 'http://evil.example.com')
        .send({ email: 'x@example.test', password: 'whatever12345' });
      expect(res.status).toBe(403);
    });

    it('allows a GET request with no Origin header', async () => {
      const res = await agent().get('/api/v1/auth/me');
      // No CSRF block — fails auth instead (401), proving the origin
      // check only gates state-changing methods.
      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/login', () => {
    it('sets an httpOnly, SameSite=Lax session cookie on success', async () => {
      await seedActiveUser('cookie@example.test', 'correct-horse-battery');
      const res = await agent()
        .post('/api/v1/auth/login')
        .set('Origin', WEB_ORIGIN)
        .send({ email: 'cookie@example.test', password: 'correct-horse-battery' });

      expect(res.status).toBe(200);
      const setCookie = res.headers['set-cookie']?.[0] ?? '';
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');
    });

    it('never includes the submitted password anywhere in the response body', async () => {
      await seedActiveUser('noleak@example.test', 'super-secret-password-999');
      const res = await agent()
        .post('/api/v1/auth/login')
        .set('Origin', WEB_ORIGIN)
        .send({ email: 'noleak@example.test', password: 'super-secret-password-999' });

      expect(JSON.stringify(res.body)).not.toContain('super-secret-password-999');
    });

    it('rejects malformed input via the shared Zod schema (400, VALIDATION_FAILED)', async () => {
      const res = await agent()
        .post('/api/v1/auth/login')
        .set('Origin', WEB_ORIGIN)
        .send({ email: 'not-an-email', password: '' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('rate-limits repeated failed attempts for the same email (429 after the threshold)', async () => {
      await seedActiveUser('throttle@example.test', 'correct-horse-battery');
      const attempt = () =>
        agent()
          .post('/api/v1/auth/login')
          .set('Origin', WEB_ORIGIN)
          .send({ email: 'throttle@example.test', password: 'wrong-password' });

      const results = [];
      for (let i = 0; i < 6; i++) {
        results.push((await attempt()).status);
      }
      expect(results.slice(0, 5).every((s) => s === 401)).toBe(true);
      expect(results[5]).toBe(429);
    });
  });

  describe('GET /auth/me + session lifecycle', () => {
    it('401s with no cookie', async () => {
      const res = await agent().get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns the current user for a valid session, then 401s after logout', async () => {
      await seedActiveUser('lifecycle@example.test', 'correct-horse-battery');
      const login = await agent()
        .post('/api/v1/auth/login')
        .set('Origin', WEB_ORIGIN)
        .send({ email: 'lifecycle@example.test', password: 'correct-horse-battery' });
      const cookie = login.headers['set-cookie'];

      const me = await agent().get('/api/v1/auth/me').set('Cookie', cookie);
      expect(me.status).toBe(200);
      expect(me.body.email).toBe('lifecycle@example.test');

      await agent().post('/api/v1/auth/logout').set('Origin', WEB_ORIGIN).set('Cookie', cookie);

      const meAfter = await agent().get('/api/v1/auth/me').set('Cookie', cookie);
      expect(meAfter.status).toBe(401);
    });

    it('401s immediately once the account is disabled mid-session', async () => {
      const user = await seedActiveUser('kill-switch@example.test', 'correct-horse-battery');
      const login = await agent()
        .post('/api/v1/auth/login')
        .set('Origin', WEB_ORIGIN)
        .send({ email: 'kill-switch@example.test', password: 'correct-horse-battery' });
      const cookie = login.headers['set-cookie'];

      expect((await agent().get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(200);

      await prisma.user.update({ where: { id: user.id }, data: { status: 'DISABLED' } });

      expect((await agent().get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(401);
    });
  });

  describe('POST /auth/select-school', () => {
    it('rejects a membership that does not belong to the caller (400, never a raw DB error)', async () => {
      await seedActiveUser('scope@example.test', 'correct-horse-battery');
      const login = await agent()
        .post('/api/v1/auth/login')
        .set('Origin', WEB_ORIGIN)
        .send({ email: 'scope@example.test', password: 'correct-horse-battery' });
      const cookie = login.headers['set-cookie'];

      const res = await agent()
        .post('/api/v1/auth/select-school')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ membershipId: 'does-not-exist' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(JSON.stringify(res.body)).not.toMatch(/prisma|stack|at Object/i);
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('returns the same generic response for an existing and a non-existent email', async () => {
      await seedActiveUser('exists@example.test', 'correct-horse-battery');
      const a = await agent()
        .post('/api/v1/auth/forgot-password')
        .set('Origin', WEB_ORIGIN)
        .send({ email: 'exists@example.test' });
      const b = await agent()
        .post('/api/v1/auth/forgot-password')
        .set('Origin', WEB_ORIGIN)
        .send({ email: 'nobody-at-all@example.test' });

      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(a.body).toEqual(b.body);
    });
  });

  describe('response shape', () => {
    it('every error response carries a requestId for log correlation', async () => {
      const res = await agent().get('/api/v1/auth/me');
      expect(res.body.requestId).toMatch(/^req_/);
      expect(res.headers['x-request-id']).toMatch(/^req_/);
    });
  });
});
