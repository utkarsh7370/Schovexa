import { PrismaClient } from '@prisma/client';

// Deletes all rows created by any test in this suite, in FK-safe
// (children-first) order. Runs against schovexa_test only (see
// apps/api/.env.test) — never the dev database. Deliberately a SINGLE
// function used by every spec file: when tests from different modules
// share one Jest process (and one database), a narrower per-module reset
// that doesn't know about another module's tables leaves cross-file
// pollution — a leftover row from one file's last test breaks the next
// file's `beforeEach` with a foreign-key violation. One comprehensive
// function, extended as each new module's tests add tables, avoids that
// entire class of bug.
export async function resetTestData(prisma: PrismaClient): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.document.deleteMany();
  await prisma.session.deleteMany();
  await prisma.authToken.deleteMany();
  await prisma.studentParent.deleteMany();
  await prisma.teacherAssignment.deleteMany();
  await prisma.student.deleteMany();
  await prisma.section.deleteMany();
  await prisma.class.deleteMany();
  await prisma.academicYear.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.parent.deleteMany();
  await prisma.schoolMembership.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.school.deleteMany();
  await prisma.user.deleteMany();
}
