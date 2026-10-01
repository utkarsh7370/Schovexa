import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { resetTestData } from './db-helpers';

// The public contact form: validation, storage, the email to the inbox
// owner (with Reply-To the visitor), honeypot, header-injection safety and
// rate limiting — through the real HTTP stack.

const WEB_ORIGIN = 'http://localhost:3000';

describe('Contact form (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const send = jest.fn();

  beforeEach(async () => {
    await resetTestData(prisma);
    send.mockReset().mockResolvedValue(true);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send, isConfigured: true })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const post = (body: object) => request(app.getHttpServer()).post('/api/v1/contact').set('Origin', WEB_ORIGIN).send(body);
  const valid = { name: 'Riya Sharma', email: 'riya@school.test', message: 'We would like a demo for 600 students.' };

  it('stores the message and emails the inbox owner with Reply-To set to the visitor', async () => {
    const res = await post({ ...valid, phone: '+91 98765 43210', organization: 'Green Valley School', topic: 'DEMO' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ status: 'ok' });

    const rows = await prisma.contactMessage.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Riya Sharma', email: 'riya@school.test', topic: 'DEMO' });
    expect(rows[0].emailedAt).not.toBeNull();
    expect(rows[0].ipHash).toMatch(/^[0-9a-f]{64}$/);

    expect(send).toHaveBeenCalledTimes(1);
    const mail = send.mock.calls[0][0];
    expect(mail.to).toBe('utkarshsingh737091@gmail.com');
    expect(mail.replyTo).toBe('riya@school.test');
    expect(mail.subject).toContain('Book a demo');
    expect(mail.text).toContain('Green Valley School');
  });

  it('keeps the message even when the email cannot be sent', async () => {
    send.mockResolvedValue(false);
    const res = await post(valid);

    expect(res.status).toBe(201);
    const [row] = await prisma.contactMessage.findMany();
    expect(row.emailedAt).toBeNull();
  });

  it('escapes HTML a visitor types and cannot inject email headers through the name', async () => {
    await post({ ...valid, name: 'Eve\r\nBcc: attacker@evil.test', message: '<script>alert(1)</script> hello there' });

    const mail = send.mock.calls[0][0];
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('rejects invalid input with field errors and stores nothing', async () => {
    const res = await post({ name: 'R', email: 'nope', message: 'short' });

    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'message']));
    expect(await prisma.contactMessage.count()).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('silently drops submissions that fill the honeypot field', async () => {
    const res = await post({ ...valid, website: 'https://spam.test' });

    expect(res.status).toBe(201);
    expect(await prisma.contactMessage.count()).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('rate limits a single client after 5 messages', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await post(valid)).status).toBe(201);
    }
    expect((await post(valid)).status).toBe(429);
  });
});
