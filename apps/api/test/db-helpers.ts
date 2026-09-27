import { PrismaClient } from '@prisma/client';

// Deletes rows created by auth tests, in FK-safe (children-first) order.
// Runs against schovexa_test only (see apps/api/.env.test) — never the
// dev database. Scoped to the tables auth tests actually touch; other
// modules' tests add their own cleanup as those modules are built.
export async function resetAuthTestData(prisma: PrismaClient): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.authToken.deleteMany();
  await prisma.schoolMembership.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.school.deleteMany();
  await prisma.user.deleteMany();
}
