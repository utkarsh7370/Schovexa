import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { resetTestData } from './db-helpers';
import { permissionCatalog } from '../prisma/seed-data/permissions';

// GET /students — opt-in pagination, global search, and class / section /
// class-teacher filters — plus GET /parents/:id. Real HTTP stack, real
// permission enforcement, same shape as student-management.e2e-spec.ts.

const WEB_ORIGIN = 'http://localhost:3000';

describe('Student list: pagination, search, filters (e2e)', () => {
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
  const post = (cookie: string, path: string, body: object) =>
    agent().post(`/api/v1${path}`).set('Origin', WEB_ORIGIN).set('Cookie', cookie).send(body);

  async function registerSchool(schoolName: string, email: string) {
    const res = await agent()
      .post('/api/v1/schools/register')
      .set('Origin', WEB_ORIGIN)
      .send({ schoolName, directorFirstName: 'D', directorLastName: 'R', email, password: 'correct-horse-battery' });
    return { cookie: res.headers['set-cookie'] as string };
  }

  // Two classes; Grade 5 has sections A (with a class teacher) and B,
  // Grade 6 has section A. Five students spread across them + one
  // unassigned, and one parent (with a phone) linked to Riya.
  async function seedSchool(email: string) {
    const { cookie } = await registerSchool('List School', email);
    const year = await post(cookie, '/academic-years', { name: '2025-26', startDate: '2025-04-01', endDate: '2026-03-31' });
    const grade5 = await post(cookie, '/classes', { academicYearId: year.body.id, name: 'Grade 5', order: 5 });
    const grade6 = await post(cookie, '/classes', { academicYearId: year.body.id, name: 'Grade 6', order: 6 });
    const g5a = await post(cookie, `/classes/${grade5.body.id}/sections`, { name: 'A' });
    const g5b = await post(cookie, `/classes/${grade5.body.id}/sections`, { name: 'B' });
    const g6a = await post(cookie, `/classes/${grade6.body.id}/sections`, { name: 'A' });

    const roles = await agent().get('/api/v1/roles').set('Cookie', cookie);
    const teacherRole = roles.body.find((r: { name: string }) => r.name === 'Teacher');
    const invite = await post(cookie, '/memberships/invitations', {
      email: 'ct@example.test',
      firstName: 'Tara',
      lastName: 'Teacher',
      roleId: teacherRole.id,
    });
    const teacher = await post(cookie, '/teachers', { userId: invite.body.userId });
    await agent()
      .patch(`/api/v1/sections/${g5a.body.id}`)
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({ classTeacherId: teacher.body.id });

    const make = async (admissionNo: string, firstName: string, lastName: string, sectionId?: string) =>
      (await post(cookie, '/students', { admissionNo, firstName, lastName, ...(sectionId ? { sectionId } : {}) })).body;
    const riya = await make('A-001', 'Riya', 'Sharma', g5a.body.id);
    await make('A-002', 'Arjun', 'Verma', g5a.body.id);
    await make('A-003', 'Kabir', 'Singh', g5b.body.id);
    await make('A-004', 'Meera', 'Nair', g6a.body.id);
    await make('A-005', 'Zoya', 'Khan');

    const parent = await post(cookie, '/parents', { firstName: 'Anita', lastName: 'Sharma', phone: '+91-9811122233' });
    await post(cookie, `/students/${riya.id}/parents`, { parentId: parent.body.id, relation: 'Mother', isPrimary: true });

    return { cookie, grade5, grade6, g5a, g5b, g6a, teacher, riya, parent };
  }

  const names = (body: { items: { firstName: string }[] }) => body.items.map((s) => s.firstName).sort();

  it('keeps returning a plain array when no page is requested (legacy callers)', async () => {
    const { cookie } = await seedSchool('list-legacy@example.test');
    const res = await agent().get('/api/v1/students').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(5);
  });

  it('paginates with total, page, pageSize and totalPages', async () => {
    const { cookie } = await seedSchool('list-page@example.test');
    const first = await agent().get('/api/v1/students?page=1&pageSize=2').set('Cookie', cookie);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ total: 5, page: 1, pageSize: 2, totalPages: 3 });
    expect(first.body.items.map((s: { admissionNo: string }) => s.admissionNo)).toEqual(['A-001', 'A-002']);

    const last = await agent().get('/api/v1/students?page=3&pageSize=2').set('Cookie', cookie);
    expect(last.body.items.map((s: { admissionNo: string }) => s.admissionNo)).toEqual(['A-005']);
  });

  it('returns section, class and class teacher on each row', async () => {
    const { cookie } = await seedSchool('list-shape@example.test');
    const res = await agent().get('/api/v1/students?page=1&search=Riya').set('Cookie', cookie);
    const riya = res.body.items[0];
    expect(riya.section.name).toBe('A');
    expect(riya.section.class.name).toBe('Grade 5');
    expect(riya.section.classTeacher.user.firstName).toBe('Tara');
  });

  it('filters by class, section and class teacher', async () => {
    const { cookie, grade5, g5b, teacher } = await seedSchool('list-filter@example.test');

    const byClass = await agent().get(`/api/v1/students?page=1&classId=${grade5.body.id}`).set('Cookie', cookie);
    expect(names(byClass.body)).toEqual(['Arjun', 'Kabir', 'Riya']);

    const bySection = await agent().get(`/api/v1/students?page=1&sectionId=${g5b.body.id}`).set('Cookie', cookie);
    expect(names(bySection.body)).toEqual(['Kabir']);

    const byTeacher = await agent().get(`/api/v1/students?page=1&classTeacherId=${teacher.body.id}`).set('Cookie', cookie);
    expect(names(byTeacher.body)).toEqual(['Arjun', 'Riya']);

    const combined = await agent()
      .get(`/api/v1/students?page=1&classId=${grade5.body.id}&classTeacherId=${teacher.body.id}`)
      .set('Cookie', cookie);
    expect(names(combined.body)).toEqual(['Arjun', 'Riya']);
  });

  it('searches names, admission numbers, class/section names and parent details', async () => {
    const { cookie } = await seedSchool('list-search@example.test');
    const search = async (q: string) =>
      names((await agent().get('/api/v1/students').query({ page: 1, search: q }).set('Cookie', cookie)).body);

    expect(await search('riya')).toEqual(['Riya']);
    expect(await search('riya sharma')).toEqual(['Riya']);
    expect(await search('sharma riya')).toEqual(['Riya']);
    expect(await search('a-003')).toEqual(['Kabir']);
    expect(await search('grade 6')).toEqual(['Meera']);
    expect(await search('anita')).toEqual(['Riya']); // parent name
    expect(await search('9811122233')).toEqual(['Riya']); // parent phone
    expect(await search('nobody-like-this')).toEqual([]);
  });

  it('treats search input as data, not as a query', async () => {
    const { cookie } = await seedSchool('list-inject@example.test');
    const res = await agent()
      .get('/api/v1/students')
      .query({ page: 1, search: `%' OR 1=1 --` })
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it('rejects bad paging and status values with a 400', async () => {
    const { cookie } = await seedSchool('list-bad@example.test');
    for (const qs of ['page=0', 'page=abc', 'page=1&pageSize=-3', 'status=BOGUS']) {
      const res = await agent().get(`/api/v1/students?${qs}`).set('Cookie', cookie);
      expect(res.status).toBe(400);
    }
  });

  it('caps pageSize at 100', async () => {
    const { cookie } = await seedSchool('list-cap@example.test');
    const res = await agent().get('/api/v1/students?page=1&pageSize=5000').set('Cookie', cookie);
    expect(res.body.pageSize).toBe(100);
  });

  it("never leaks another school's students, even with their ids in the filters", async () => {
    const a = await seedSchool('list-tenant-a@example.test');
    const b = await registerSchool('Other School', 'list-tenant-b@example.test');
    await post(b.cookie, '/students', { admissionNo: 'B-001', firstName: 'Bina', lastName: 'Other' });

    const res = await agent().get(`/api/v1/students?page=1&classId=${a.grade5.body.id}`).set('Cookie', b.cookie);
    expect(res.body.total).toBe(0);

    const all = await agent().get('/api/v1/students?page=1').set('Cookie', b.cookie);
    expect(names(all.body)).toEqual(['Bina']);
  });

  it('returns a parent with their linked children, and 404s across tenants', async () => {
    const { cookie, parent } = await seedSchool('list-parent@example.test');
    const res = await agent().get(`/api/v1/parents/${parent.body.id}`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.children).toHaveLength(1);
    expect(res.body.children[0].student.firstName).toBe('Riya');
    expect(res.body.children[0].relation).toBe('Mother');

    const other = await registerSchool('Other Parent School', 'list-parent-b@example.test');
    const cross = await agent().get(`/api/v1/parents/${parent.body.id}`).set('Cookie', other.cookie);
    expect(cross.status).toBe(404);
  });
});
