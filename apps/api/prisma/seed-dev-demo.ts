// Development-only demo data (docs/product-requirements.md §55-56 style:
// clearly fictional, just enough to exercise the auth flow end-to-end)
// for a single school + one pending admin invitation. This is NOT run in
// production and is NOT the multi-school seed described in the master
// brief's "Realistic Demo Data" section — that full seed (multiple
// schools, classes, students, teachers, parents) belongs to the School
// Management / Students / Academics phases, once those modules exist.
// This script exists solely so Phase 3 (Authentication)'s invite ->
// accept-invite -> login flow can be exercised without those later
// modules being built yet.
import { PrismaClient, AuthTokenPurpose } from '@prisma/client';
import { generateOpaqueToken, hashToken } from '../src/auth/token.util';

const prisma = new PrismaClient();

const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function main() {
  const school = await prisma.school.upsert({
    where: { slug: 'sunrise-demo' },
    update: {},
    create: {
      name: 'Sunrise Public School (Demo)',
      slug: 'sunrise-demo',
      contactEmail: 'admin@sunrise-demo.schovexa.test',
    },
  });

  const existingRole = await prisma.role.findFirst({
    where: { schoolId: school.id, name: 'School Administrator', deletedAt: null },
  });
  const role =
    existingRole ??
    (await prisma.role.create({
      data: { schoolId: school.id, name: 'School Administrator', isSystem: true },
    }));

  // Grant this demo role ALL_SCHOOL on the user/school/role permissions
  // seeded by prisma/seed.ts, so the eventual School Management phase has
  // a role to test against too.
  const adminPermissions = await prisma.permission.findMany({
    where: { module: { in: ['user', 'school', 'role'] } },
  });
  for (const permission of adminPermissions) {
    const existingGrant = await prisma.rolePermission.findFirst({
      where: { roleId: role.id, permissionId: permission.id },
    });
    if (!existingGrant) {
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id, scope: 'ALL_SCHOOL' },
      });
    }
  }

  const email = 'director@sunrise-demo.schovexa.test';
  let user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (!user) {
    user = await prisma.user.create({
      data: { email, firstName: 'Demo', lastName: 'Director', passwordHash: '', status: 'INVITED' },
    });
  }

  const existingMembership = await prisma.schoolMembership.findFirst({
    where: { userId: user.id, schoolId: school.id, deletedAt: null },
  });
  if (!existingMembership) {
    await prisma.schoolMembership.create({
      data: { userId: user.id, schoolId: school.id, roleId: role.id },
    });
  }

  const rawToken = generateOpaqueToken();
  await prisma.authToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      purpose: AuthTokenPurpose.INVITE,
      expiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS),
    },
  });

  console.log('Demo school:', school.name, `(${school.id})`);
  console.log('Demo admin email:', email);
  console.log('Invite token (paste into POST /api/v1/auth/accept-invite):');
  console.log(rawToken);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
