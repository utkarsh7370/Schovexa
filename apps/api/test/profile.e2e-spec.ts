import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { resetTestData } from './db-helpers';
import { permissionCatalog } from '../prisma/seed-data/permissions';

// "My profile", the teacher/staff profile views, personal documents and
// the signed-in password change — through the real HTTP stack.

const WEB_ORIGIN = 'http://localhost:3000';
const PDF = Buffer.from('%PDF-1.4 test');

describe('Profiles (e2e)', () => {
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
  const send = (method: 'post' | 'patch' | 'delete', cookie: string, path: string, body?: object) =>
    agent()[method](`/api/v1${path}`).set('Origin', WEB_ORIGIN).set('Cookie', cookie).send(body);
  const get = (cookie: string, path: string) => agent().get(`/api/v1${path}`).set('Cookie', cookie);

  async function registerSchool(schoolName: string, email: string) {
    const res = await agent()
      .post('/api/v1/schools/register')
      .set('Origin', WEB_ORIGIN)
      .send({ schoolName, directorFirstName: 'Dee', directorLastName: 'Rector', email, password: 'correct-horse-battery' });
    return { cookie: res.headers['set-cookie'] as unknown as string };
  }

  async function inviteAndLogin(directorCookie: string, roleName: string, email: string) {
    const roles = await get(directorCookie, '/roles');
    const role = roles.body.find((r: { name: string }) => r.name === roleName);
    const invite = await send('post', directorCookie, '/memberships/invitations', { email, firstName: 'Tara', lastName: 'Teacher', roleId: role.id });
    await agent().post('/api/v1/auth/accept-invite').set('Origin', WEB_ORIGIN).send({ token: invite.body.inviteToken, password: 'staff-pass-12345' });
    const login = await agent().post('/api/v1/auth/login').set('Origin', WEB_ORIGIN).send({ email, password: 'staff-pass-12345' });
    const cookie = login.headers['set-cookie'] as unknown as string;
    const me = await get(cookie, '/auth/me');
    const membershipId = me.body.memberships[0].membershipId as string;
    await send('post', cookie, '/auth/select-school', { membershipId });
    return { cookie, membershipId, userId: me.body.id as string };
  }

  const details = {
    firstName: 'Dee',
    lastName: 'Rector',
    phone: '+91 98765 43210',
    dateOfBirth: '1985-04-12',
    gender: 'FEMALE',
    address: '12 Park Street, Kolkata',
    emergencyContactName: 'Sam Rector',
    emergencyContactPhone: '+91 90000 11111',
    bio: 'Running schools for 15 years.',
  };

  it('lets any signed-in user view and edit their own profile', async () => {
    const { cookie } = await registerSchool('Profile School', 'profile1@example.test');

    const before = await get(cookie, '/me/profile');
    expect(before.status).toBe(200);
    expect(before.body.user).toMatchObject({ email: 'profile1@example.test', phone: null, bio: null });
    expect(before.body.role.name).toBe('Director');
    expect(before.body.user).not.toHaveProperty('passwordHash');

    const saved = await send('patch', cookie, '/me/profile', details);
    expect(saved.status).toBe(200);
    expect(saved.body.user).toMatchObject({ phone: '+91 98765 43210', dateOfBirth: '1985-04-12', gender: 'FEMALE', emergencyContactName: 'Sam Rector' });

    // Blank fields clear the value.
    const cleared = await send('patch', cookie, '/me/profile', { ...details, phone: '', bio: '' });
    expect(cleared.body.user.phone).toBeNull();
    expect(cleared.body.user.bio).toBeNull();
    expect(cleared.body.user.address).toBe('12 Park Street, Kolkata');
  });

  it('rejects bad profile input', async () => {
    const { cookie } = await registerSchool('Validation School', 'profile2@example.test');
    const cases: object[] = [
      { ...details, firstName: '' },
      { ...details, phone: 'call me maybe' },
      { ...details, dateOfBirth: '2999-01-01' },
      { ...details, dateOfBirth: '12/04/1985' },
      { ...details, gender: 'ROBOT' },
      { ...details, bio: 'x'.repeat(501) },
    ];
    for (const body of cases) {
      expect((await send('patch', cookie, '/me/profile', body)).status).toBe(400);
    }
  });

  it('requires a session', async () => {
    expect((await agent().get('/api/v1/me/profile')).status).toBe(401);
  });

  it('ignores any attempt to edit another user — the route only ever touches the session user', async () => {
    const { cookie: directorCookie } = await registerSchool('Own Only School', 'profile3@example.test');
    const teacher = await inviteAndLogin(directorCookie, 'Teacher', 'profile3t@example.test');

    await send('patch', teacher.cookie, '/me/profile', { ...details, firstName: 'Tara', lastName: 'Teacher', userId: 'someone-else', email: 'hijack@example.test' });

    const director = await get(directorCookie, '/me/profile');
    expect(director.body.user.firstName).toBe('Dee');
    const mine = await get(teacher.cookie, '/me/profile');
    expect(mine.body.user.email).toBe('profile3t@example.test');
  });

  it('stores, lists, downloads and deletes a person’s own documents', async () => {
    const { cookie } = await registerSchool('Docs School', 'profile4@example.test');

    const up = await agent().post('/api/v1/me/documents').set('Origin', WEB_ORIGIN).set('Cookie', cookie).attach('file', PDF, { filename: 'passport.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);

    const list = await get(cookie, '/me/documents');
    expect(list.body).toHaveLength(1);
    expect(list.body[0].fileName).toBe('passport.pdf');

    const download = await get(cookie, `/me/documents/${up.body.id}/download`);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('application/pdf');

    const bad = await agent().post('/api/v1/me/documents').set('Origin', WEB_ORIGIN).set('Cookie', cookie).attach('file', Buffer.from('MZ'), { filename: 'virus.exe', contentType: 'application/x-msdownload' });
    expect(bad.status).toBe(400);

    expect((await send('delete', cookie, `/me/documents/${up.body.id}`)).status).toBe(200);
    expect((await get(cookie, '/me/documents')).body).toHaveLength(0);
  });

  it('keeps one person’s documents out of reach of every other user — including the generic document routes', async () => {
    const { cookie: directorCookie } = await registerSchool('Private Docs School', 'profile5@example.test');
    const teacher = await inviteAndLogin(directorCookie, 'Teacher', 'profile5t@example.test');
    const receptionist = await inviteAndLogin(directorCookie, 'Receptionist', 'profile5r@example.test');

    const up = await agent().post('/api/v1/me/documents').set('Origin', WEB_ORIGIN).set('Cookie', teacher.cookie).attach('file', PDF, { filename: 'id-proof.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);

    // Another user can't reach it through /me…
    expect((await get(directorCookie, `/me/documents/${up.body.id}/download`)).status).toBe(404);
    expect((await send('delete', directorCookie, `/me/documents/${up.body.id}`)).status).toBe(404);
    // …nor through the generic document route a Director (document.view, ALL_SCHOOL) holds.
    expect((await get(directorCookie, `/documents/${up.body.id}/download`)).status).toBe(404);
    expect((await send('delete', directorCookie, `/documents/${up.body.id}`)).status).toBe(404);

    // The Director can see it through the staff view, which is permission-gated…
    const staffList = await get(directorCookie, `/staff/${teacher.membershipId}/documents`);
    expect(staffList.body).toHaveLength(1);
    expect((await get(directorCookie, `/staff/${teacher.membershipId}/documents/${up.body.id}/download`)).status).toBe(200);
    // …the Receptionist can't.
    expect((await get(receptionist.cookie, `/staff/${teacher.membershipId}/documents`)).status).toBe(403);
    expect((await get(receptionist.cookie, `/staff/${teacher.membershipId}`)).status).toBe(403);
  });

  it('shows the staff profile and the teacher profile (with assignments) to people who may view staff', async () => {
    const { cookie: directorCookie } = await registerSchool('Staff View School', 'profile6@example.test');
    const teacher = await inviteAndLogin(directorCookie, 'Teacher', 'profile6t@example.test');
    await send('patch', teacher.cookie, '/me/profile', { firstName: 'Tara', lastName: 'Teacher', phone: '+91 91111 22222' });
    const created = await send('post', directorCookie, '/teachers', { userId: teacher.userId, employeeCode: 'T-007', joiningDate: '2024-06-01' });
    expect(created.status).toBe(201);

    const staff = await get(directorCookie, `/staff/${teacher.membershipId}`);
    expect(staff.status).toBe(200);
    expect(staff.body).toMatchObject({ role: { name: 'Teacher' }, status: 'ACTIVE' });
    expect(staff.body.user).toMatchObject({ phone: '+91 91111 22222' });
    expect(staff.body.teacher).toMatchObject({ employeeCode: 'T-007', joiningDate: '2024-06-01', assignments: [] });

    const byTeacher = await get(directorCookie, `/teachers/${created.body.id}`);
    expect(byTeacher.status).toBe(200);
    expect(byTeacher.body.membershipId).toBe(teacher.membershipId);

    // A Teacher can't browse other staff.
    expect((await get(teacher.cookie, `/staff/${teacher.membershipId}`)).status).toBe(403);
    expect((await get(teacher.cookie, `/teachers/${created.body.id}`)).status).toBe(403);
  });

  it('404s a staff or teacher profile from another school', async () => {
    const { cookie: aCookie } = await registerSchool('School A', 'profile7a@example.test');
    const { cookie: bCookie } = await registerSchool('School B', 'profile7b@example.test');
    const teacherA = await inviteAndLogin(aCookie, 'Teacher', 'profile7t@example.test');
    const created = await send('post', aCookie, '/teachers', { userId: teacherA.userId });

    expect((await get(bCookie, `/staff/${teacherA.membershipId}`)).status).toBe(404);
    expect((await get(bCookie, `/staff/${teacherA.membershipId}/documents`)).status).toBe(404);
    expect((await get(bCookie, `/teachers/${created.body.id}`)).status).toBe(404);
  });

  describe('change password', () => {
    it('needs the current password, keeps this session and revokes the others', async () => {
      await registerSchool('Password School', 'profile8@example.test');
      const login = () => agent().post('/api/v1/auth/login').set('Origin', WEB_ORIGIN).send({ email: 'profile8@example.test', password: 'correct-horse-battery' });
      const first = (await login()).headers['set-cookie'] as unknown as string;
      const second = (await login()).headers['set-cookie'] as unknown as string;

      const wrong = await send('post', first, '/auth/change-password', { currentPassword: 'not-my-password', newPassword: 'a-brand-new-passphrase' });
      expect(wrong.status).toBe(400);
      expect(wrong.body.error.details[0].field).toBe('currentPassword');

      const same = await send('post', first, '/auth/change-password', { currentPassword: 'correct-horse-battery', newPassword: 'correct-horse-battery' });
      expect(same.status).toBe(400);
      const weak = await send('post', first, '/auth/change-password', { currentPassword: 'correct-horse-battery', newPassword: 'short' });
      expect(weak.status).toBe(400);

      const ok = await send('post', first, '/auth/change-password', { currentPassword: 'correct-horse-battery', newPassword: 'a-brand-new-passphrase' });
      expect(ok.status).toBe(200);

      expect((await get(first, '/auth/me')).status).toBe(200); // the session that made the change lives on
      expect((await get(second, '/auth/me')).status).toBe(401); // every other session is gone

      const oldLogin = await login();
      expect(oldLogin.status).toBe(401);
      const newLogin = await agent().post('/api/v1/auth/login').set('Origin', WEB_ORIGIN).send({ email: 'profile8@example.test', password: 'a-brand-new-passphrase' });
      expect(newLogin.status).toBe(200);
    });
  });
});
