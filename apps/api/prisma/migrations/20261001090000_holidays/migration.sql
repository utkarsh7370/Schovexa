-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('NATIONAL', 'FESTIVAL', 'VACATION', 'SCHOOL', 'OTHER');

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "HolidayType" NOT NULL DEFAULT 'OTHER',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Holiday_schoolId_startDate_idx" ON "Holiday"("schoolId", "startDate");

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Permissions for the new module. Inserted here (not only in the seed
-- catalog) so schools that already exist get working holiday access the
-- moment this migration is deployed, with no manual re-seed step.
INSERT INTO "Permission" ("id", "key", "module", "action", "description") VALUES
  ('perm_holiday_view',   'holiday.view',   'holiday', 'view',   'View the school holiday calendar'),
  ('perm_holiday_create', 'holiday.create', 'holiday', 'create', 'Add a holiday'),
  ('perm_holiday_update', 'holiday.update', 'holiday', 'update', 'Edit a holiday'),
  ('perm_holiday_delete', 'holiday.delete', 'holiday', 'delete', 'Delete a holiday')
ON CONFLICT ("key") DO NOTHING;

-- Directors manage holidays in every existing school…
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'ALL_SCHOOL', false
FROM "Role" r
JOIN "Permission" p ON p."key" IN ('holiday.view', 'holiday.create', 'holiday.update', 'holiday.delete')
WHERE r."name" = 'Director' AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- …and every other built-in role can see the calendar.
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'ALL_SCHOOL', false
FROM "Role" r
JOIN "Permission" p ON p."key" = 'holiday.view'
WHERE r."name" <> 'Director' AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
