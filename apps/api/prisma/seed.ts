// Prisma seed entrypoint (invoked by `npm run seed` or automatically by
// `prisma migrate reset`). Phase 2 (Database) seeds only platform-level,
// school-independent data — the global Permission catalog. Default
// Role/RolePermission rows are school-scoped (docs/database.md §3) and
// are seeded per-school during onboarding (docs/product-requirements.md
// §7, "School Management" phase in docs/modules.md) — not here, since
// there is no School yet at this phase.
import { PrismaClient } from '@prisma/client';
import { permissionCatalog } from './seed-data/permissions';

const prisma = new PrismaClient();

async function main() {
  for (const permission of permissionCatalog) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { module: permission.module, action: permission.action, description: permission.description },
      create: permission,
    });
  }
  console.log(`Seeded ${permissionCatalog.length} permissions.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
