import { AuthorizationService } from './authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { resetTestData } from '../../test/db-helpers';
import type { AuthContext } from './authorization.types';

// Integration-style tests against the real schovexa_test database, same
// pattern as auth.service.spec.ts — Prisma's query surface is large
// enough that mocking it convincingly tends to test the mock. Covers
// every scope resolver in docs/authorization.md §3 plus the readOnly
// modifier, including the cross-tenant matrix rows that are meaningful
// at the service level (docs/multi-tenancy.md §5 rows 1, 3, 4, 5, 6).

describe('AuthorizationService', () => {
  let prisma: PrismaService;
  let service: AuthorizationService;

  beforeAll(async () => {
    prisma = new PrismaService();
    service = new AuthorizationService(prisma);

    // Global Permission catalog — upserted here so this spec is
    // self-contained and doesn't depend on `npm run seed` having been
    // run against schovexa_test first (Permission rows are never
    // deleted by resetTestData, since the catalog is
    // platform-global, not per-test state).
    await prisma.permission.upsert({
      where: { key: 'student.view' },
      update: {},
      create: { key: 'student.view', module: 'student', action: 'view', description: 'View student records' },
    });
    await prisma.permission.upsert({
      where: { key: 'student.update' },
      update: {},
      create: { key: 'student.update', module: 'student', action: 'update', description: 'Update a student record' },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetTestData(prisma);
  });

  async function makeSchoolWithRole(schoolName: string, slug: string, scope: string, readOnly = false) {
    const school = await prisma.school.create({ data: { name: schoolName, slug } });
    const role = await prisma.role.create({ data: { schoolId: school.id, name: 'TestRole' } });
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: 'student.view' } });
    await prisma.rolePermission.create({
      data: {
        roleId: role.id,
        permissionId: permission.id,
        scope: scope as never,
        readOnly,
      },
    });
    return { school, role };
  }

  async function makeUser(email: string) {
    return prisma.user.create({
      data: { email, firstName: 'T', lastName: 'U', status: 'ACTIVE', passwordHash: 'x' },
    });
  }

  function authContextFor(schoolId: string, roleId: string, userId: string, membershipId = 'membership-stub'): AuthContext {
    return { userId, schoolId, membershipId, roleId };
  }

  describe('getGrant', () => {
    it('returns null when the role has no such permission', async () => {
      const { role } = await makeSchoolWithRole('S', 'g1', 'ALL_SCHOOL');
      expect(await service.getGrant(role.id, 'student.update')).toBeNull();
    });

    it('returns null for an unknown permission key', async () => {
      const { role } = await makeSchoolWithRole('S', 'g2', 'ALL_SCHOOL');
      expect(await service.getGrant(role.id, 'not.a.real.permission')).toBeNull();
    });

    it('returns the scope, readOnly, and action for a granted permission', async () => {
      const { role } = await makeSchoolWithRole('S', 'g3', 'OWN_STUDENTS', true);
      const grant = await service.getGrant(role.id, 'student.view');
      expect(grant).toEqual({ scope: 'OWN_STUDENTS', readOnly: true, action: 'view' });
    });
  });

  describe('isMutationBlockedByReadOnly', () => {
    it('allows a "view" action even when readOnly is true', () => {
      expect(service.isMutationBlockedByReadOnly({ scope: 'ALL_SCHOOL', readOnly: true, action: 'view' })).toBe(
        false,
      );
    });

    it('blocks a mutating action when readOnly is true', () => {
      expect(
        service.isMutationBlockedByReadOnly({ scope: 'ALL_SCHOOL', readOnly: true, action: 'update' }),
      ).toBe(true);
    });

    it('allows a mutating action when readOnly is false', () => {
      expect(
        service.isMutationBlockedByReadOnly({ scope: 'ALL_SCHOOL', readOnly: false, action: 'update' }),
      ).toBe(false);
    });
  });

  describe('ALL_SCHOOL scope', () => {
    it('allows a resource in the same school', async () => {
      const { school, role } = await makeSchoolWithRole('School A', 'all-school-1', 'ALL_SCHOOL');
      const admin = await makeUser('admin1@example.test');
      const student = await prisma.student.create({
        data: { schoolId: school.id, admissionNo: 'A1', firstName: 'S', lastName: 'T' },
      });

      const auth = { ...authContextFor(school.id, role.id, admin.id), scope: 'ALL_SCHOOL' as const };
      await expect(service.authorizeResource(auth, 'Student', student.id)).resolves.toBeUndefined();
    });

    it('denies a resource belonging to a different school (cross-tenant, matrix row 1)', async () => {
      const { school: schoolA, role } = await makeSchoolWithRole('School A', 'all-school-2', 'ALL_SCHOOL');
      const schoolB = await prisma.school.create({ data: { name: 'School B', slug: 'all-school-2-b' } });
      const admin = await makeUser('admin2@example.test');
      const studentInB = await prisma.student.create({
        data: { schoolId: schoolB.id, admissionNo: 'B1', firstName: 'S', lastName: 'T' },
      });

      const auth = { ...authContextFor(schoolA.id, role.id, admin.id), scope: 'ALL_SCHOOL' as const };
      await expect(service.authorizeResource(auth, 'Student', studentInB.id)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('SELF scope', () => {
    it('allows a student to view their own record', async () => {
      const { school, role } = await makeSchoolWithRole('S', 'self-1', 'SELF');
      const studentUser = await makeUser('student1@example.test');
      const student = await prisma.student.create({
        data: { schoolId: school.id, userId: studentUser.id, admissionNo: 'S1', firstName: 'S', lastName: 'T' },
      });

      const auth = { ...authContextFor(school.id, role.id, studentUser.id), scope: 'SELF' as const };
      await expect(service.authorizeResource(auth, 'Student', student.id)).resolves.toBeUndefined();
    });

    it('denies a student viewing another student record (matrix row 5)', async () => {
      const { school, role } = await makeSchoolWithRole('S', 'self-2', 'SELF');
      const studentUserA = await makeUser('student2a@example.test');
      const studentUserB = await makeUser('student2b@example.test');
      const studentB = await prisma.student.create({
        data: { schoolId: school.id, userId: studentUserB.id, admissionNo: 'S2', firstName: 'S', lastName: 'T' },
      });

      const auth = { ...authContextFor(school.id, role.id, studentUserA.id), scope: 'SELF' as const };
      await expect(service.authorizeResource(auth, 'Student', studentB.id)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('OWN_CHILDREN scope', () => {
    it('allows a parent to view their own linked child', async () => {
      const { school, role } = await makeSchoolWithRole('S', 'own-children-1', 'OWN_CHILDREN');
      const parentUser = await makeUser('parent1@example.test');
      const parentProfile = await prisma.parent.create({
        data: { schoolId: school.id, userId: parentUser.id, firstName: 'P', lastName: 'R' },
      });
      const child = await prisma.student.create({
        data: { schoolId: school.id, admissionNo: 'C1', firstName: 'S', lastName: 'T' },
      });
      await prisma.studentParent.create({
        data: { schoolId: school.id, studentId: child.id, parentId: parentProfile.id, relation: 'father' },
      });

      const auth = { ...authContextFor(school.id, role.id, parentUser.id), scope: 'OWN_CHILDREN' as const };
      await expect(service.authorizeResource(auth, 'Student', child.id)).resolves.toBeUndefined();
    });

    it("denies a parent viewing a child that isn't theirs (matrix row 6)", async () => {
      const { school, role } = await makeSchoolWithRole('S', 'own-children-2', 'OWN_CHILDREN');
      const parentUser = await makeUser('parent2@example.test');
      await prisma.parent.create({
        data: { schoolId: school.id, userId: parentUser.id, firstName: 'P', lastName: 'R' },
      });
      const someoneElsesChild = await prisma.student.create({
        data: { schoolId: school.id, admissionNo: 'C2', firstName: 'S', lastName: 'T' },
      });

      const auth = { ...authContextFor(school.id, role.id, parentUser.id), scope: 'OWN_CHILDREN' as const };
      await expect(service.authorizeResource(auth, 'Student', someoneElsesChild.id)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  async function makeAcademicStructure(schoolId: string) {
    const year = await prisma.academicYear.create({
      data: { schoolId, name: '2025-26', startDate: new Date('2025-04-01'), endDate: new Date('2026-03-31') },
    });
    const klass = await prisma.class.create({ data: { schoolId, academicYearId: year.id, name: 'Grade 6', order: 6 } });
    const sectionX = await prisma.section.create({ data: { schoolId, classId: klass.id, name: 'X' } });
    const sectionY = await prisma.section.create({ data: { schoolId, classId: klass.id, name: 'Y' } });
    const subjectMath = await prisma.subject.create({ data: { schoolId, name: 'Mathematics' } });
    const subjectScience = await prisma.subject.create({ data: { schoolId, name: 'Science' } });
    return { sectionX, sectionY, subjectMath, subjectScience };
  }

  describe('OWN_STUDENTS scope', () => {
    it('allows a class teacher to view a student in their own section', async () => {
      const { school, role } = await makeSchoolWithRole('S', 'own-students-1', 'OWN_STUDENTS');
      const { sectionX } = await makeAcademicStructure(school.id);
      const teacherUser = await makeUser('teacher1@example.test');
      const teacher = await prisma.teacher.create({ data: { schoolId: school.id, userId: teacherUser.id } });
      await prisma.section.update({ where: { id: sectionX.id }, data: { classTeacherId: teacher.id } });
      const student = await prisma.student.create({
        data: { schoolId: school.id, sectionId: sectionX.id, admissionNo: 'ST1', firstName: 'S', lastName: 'T' },
      });

      const auth = { ...authContextFor(school.id, role.id, teacherUser.id), scope: 'OWN_STUDENTS' as const };
      await expect(service.authorizeResource(auth, 'Student', student.id)).resolves.toBeUndefined();
    });

    it('denies a teacher viewing a student in a section they do not own', async () => {
      const { school, role } = await makeSchoolWithRole('S', 'own-students-2', 'OWN_STUDENTS');
      const { sectionX, sectionY } = await makeAcademicStructure(school.id);
      const teacherUser = await makeUser('teacher2@example.test');
      const teacher = await prisma.teacher.create({ data: { schoolId: school.id, userId: teacherUser.id } });
      await prisma.section.update({ where: { id: sectionX.id }, data: { classTeacherId: teacher.id } });
      const studentInOtherSection = await prisma.student.create({
        data: { schoolId: school.id, sectionId: sectionY.id, admissionNo: 'ST2', firstName: 'S', lastName: 'T' },
      });

      const auth = { ...authContextFor(school.id, role.id, teacherUser.id), scope: 'OWN_STUDENTS' as const };
      await expect(service.authorizeResource(auth, 'Student', studentInOtherSection.id)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('OWN_CLASS scope', () => {
    it('allows a teacher assigned (via TeacherAssignment) to view their section', async () => {
      const { school, role } = await makeSchoolWithRole('S', 'own-class-1', 'OWN_CLASS');
      const { sectionX, subjectMath } = await makeAcademicStructure(school.id);
      const teacherUser = await makeUser('teacher3@example.test');
      const teacher = await prisma.teacher.create({ data: { schoolId: school.id, userId: teacherUser.id } });
      await prisma.teacherAssignment.create({
        data: { schoolId: school.id, teacherId: teacher.id, sectionId: sectionX.id, subjectId: subjectMath.id },
      });

      const auth = { ...authContextFor(school.id, role.id, teacherUser.id), scope: 'OWN_CLASS' as const };
      await expect(service.authorizeResource(auth, 'Section', sectionX.id)).resolves.toBeUndefined();
    });

    it("denies a teacher accessing a section they aren't assigned to (matrix row 3)", async () => {
      const { school, role } = await makeSchoolWithRole('S', 'own-class-2', 'OWN_CLASS');
      const { sectionX, sectionY, subjectMath } = await makeAcademicStructure(school.id);
      const teacherUser = await makeUser('teacher4@example.test');
      const teacher = await prisma.teacher.create({ data: { schoolId: school.id, userId: teacherUser.id } });
      await prisma.teacherAssignment.create({
        data: { schoolId: school.id, teacherId: teacher.id, sectionId: sectionX.id, subjectId: subjectMath.id },
      });

      const auth = { ...authContextFor(school.id, role.id, teacherUser.id), scope: 'OWN_CLASS' as const };
      await expect(service.authorizeResource(auth, 'Section', sectionY.id)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('OWN_SUBJECT scope', () => {
    it('allows a teacher assigned to a subject to view it', async () => {
      const { school, role } = await makeSchoolWithRole('S', 'own-subject-1', 'OWN_SUBJECT');
      const { sectionX, subjectMath } = await makeAcademicStructure(school.id);
      const teacherUser = await makeUser('teacher5@example.test');
      const teacher = await prisma.teacher.create({ data: { schoolId: school.id, userId: teacherUser.id } });
      await prisma.teacherAssignment.create({
        data: { schoolId: school.id, teacherId: teacher.id, sectionId: sectionX.id, subjectId: subjectMath.id },
      });

      const auth = { ...authContextFor(school.id, role.id, teacherUser.id), scope: 'OWN_SUBJECT' as const };
      await expect(service.authorizeResource(auth, 'Subject', subjectMath.id)).resolves.toBeUndefined();
    });

    it("denies a teacher accessing a subject they don't teach (matrix row 4)", async () => {
      const { school, role } = await makeSchoolWithRole('S', 'own-subject-2', 'OWN_SUBJECT');
      const { sectionX, subjectMath, subjectScience } = await makeAcademicStructure(school.id);
      const teacherUser = await makeUser('teacher6@example.test');
      const teacher = await prisma.teacher.create({ data: { schoolId: school.id, userId: teacherUser.id } });
      await prisma.teacherAssignment.create({
        data: { schoolId: school.id, teacherId: teacher.id, sectionId: sectionX.id, subjectId: subjectMath.id },
      });

      const auth = { ...authContextFor(school.id, role.id, teacherUser.id), scope: 'OWN_SUBJECT' as const };
      await expect(service.authorizeResource(auth, 'Subject', subjectScience.id)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('missing scope on AuthContext', () => {
    it('throws Forbidden (config error) rather than silently allowing access', async () => {
      const { school, role } = await makeSchoolWithRole('S', 'no-scope', 'ALL_SCHOOL');
      const user = await makeUser('noscope@example.test');
      const student = await prisma.student.create({
        data: { schoolId: school.id, admissionNo: 'NS1', firstName: 'S', lastName: 'T' },
      });

      const auth = authContextFor(school.id, role.id, user.id); // no .scope set
      await expect(service.authorizeResource(auth, 'Student', student.id)).rejects.toMatchObject({
        status: 403,
      });
    });
  });
});
