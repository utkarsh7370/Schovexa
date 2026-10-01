import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { resetTestData } from './db-helpers';
import { permissionCatalog } from '../prisma/seed-data/permissions';

// Half-day students: a student can attend the whole day, only the first
// half, or only the second — stored on the student, editable, filterable
// in the list and the reports.

const WEB_ORIGIN = 'http://localhost:3000';

describe('Student school day (e2e)', () => {
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
  const send = (method: 'post' | 'patch', cookie: string, path: string, body?: object) =>
    agent()[method](`/api/v1${path}`).set('Origin', WEB_ORIGIN).set('Cookie', cookie).send(body);
  const get = (cookie: string, path: string) => agent().get(`/api/v1${path}`).set('Cookie', cookie);

  async function setup() {
    const res = await agent()
      .post('/api/v1/schools/register')
      .set('Origin', WEB_ORIGIN)
      .send({ schoolName: 'Half Day School', directorFirstName: 'D', directorLastName: 'R', email: 'halfday@example.test', password: 'correct-horse-battery' });
    return res.headers['set-cookie'] as unknown as string;
  }

  const student = (n: number, extra: object = {}) => ({ admissionNo: `HD-${n}`, firstName: `Kid${n}`, lastName: 'Test', ...extra });

  it('defaults to the full day, and accepts a first-half or second-half student', async () => {
    const cookie = await setup();
    const full = await send('post', cookie, '/students', student(1));
    const first = await send('post', cookie, '/students', student(2, { schoolDay: 'FIRST_HALF' }));
    const second = await send('post', cookie, '/students', student(3, { schoolDay: 'SECOND_HALF' }));
    expect([full.status, first.status, second.status]).toEqual([201, 201, 201]);
    expect(full.body.schoolDay).toBe('FULL_DAY');
    expect(first.body.schoolDay).toBe('FIRST_HALF');
    expect(second.body.schoolDay).toBe('SECOND_HALF');
  });

  it('rejects an unknown school day', async () => {
    const cookie = await setup();
    expect((await send('post', cookie, '/students', student(1, { schoolDay: 'NIGHT' }))).status).toBe(400);
    const ok = await send('post', cookie, '/students', student(2));
    expect((await send('patch', cookie, `/students/${ok.body.id}`, { schoolDay: 'WHENEVER' })).status).toBe(400);
  });

  it('changes a student between full day and half days, and shows it on the profile', async () => {
    const cookie = await setup();
    const created = await send('post', cookie, '/students', student(1));

    const half = await send('patch', cookie, `/students/${created.body.id}`, { schoolDay: 'SECOND_HALF' });
    expect(half.status).toBe(200);
    expect(half.body.schoolDay).toBe('SECOND_HALF');
    expect((await get(cookie, `/students/${created.body.id}`)).body.schoolDay).toBe('SECOND_HALF');

    const back = await send('patch', cookie, `/students/${created.body.id}`, { schoolDay: 'FULL_DAY' });
    expect(back.body.schoolDay).toBe('FULL_DAY');
    // Other edits leave it alone.
    await send('patch', cookie, `/students/${created.body.id}`, { schoolDay: 'FIRST_HALF' });
    const renamed = await send('patch', cookie, `/students/${created.body.id}`, { firstName: 'Renamed' });
    expect(renamed.body.schoolDay).toBe('FIRST_HALF');
  });

  it('filters the student list by school day', async () => {
    const cookie = await setup();
    await send('post', cookie, '/students', student(1));
    await send('post', cookie, '/students', student(2, { schoolDay: 'FIRST_HALF' }));
    await send('post', cookie, '/students', student(3, { schoolDay: 'FIRST_HALF' }));
    await send('post', cookie, '/students', student(4, { schoolDay: 'SECOND_HALF' }));

    const first = await get(cookie, '/students?schoolDay=FIRST_HALF&page=1&pageSize=20');
    expect(first.body.items.map((s: { admissionNo: string }) => s.admissionNo)).toEqual(['HD-2', 'HD-3']);
    expect((await get(cookie, '/students?schoolDay=SECOND_HALF')).body).toHaveLength(1);
    expect((await get(cookie, '/students')).body).toHaveLength(4);
    expect((await get(cookie, '/students?schoolDay=BOGUS')).status).toBe(400);
  });

  it('carries the school day into the student report, its filter and the CSV', async () => {
    const cookie = await setup();
    await send('post', cookie, '/students', student(1));
    await send('post', cookie, '/students', student(2, { schoolDay: 'FIRST_HALF' }));

    const report = await get(cookie, '/reports/students');
    expect(report.body.data.map((r: { schoolDay: string }) => r.schoolDay).sort()).toEqual(['FIRST_HALF', 'FULL_DAY']);

    const filtered = await get(cookie, '/reports/students?schoolDay=FIRST_HALF');
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0].admissionNo).toBe('HD-2');

    const csv = await get(cookie, '/reports/students/export?schoolDay=FIRST_HALF');
    expect(csv.text).toContain('School Day');
    expect(csv.text).toContain('FIRST_HALF');
    expect(csv.text).not.toContain('HD-1');
  });
});
