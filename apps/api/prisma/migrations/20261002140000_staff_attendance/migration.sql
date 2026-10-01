-- CreateEnum
CREATE TYPE "StaffAttendanceApproval" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "StaffAttendanceSource" AS ENUM ('SELF', 'BIOMETRIC');

-- CreateTable
CREATE TABLE "StaffAttendance" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "punchInAt" TIMESTAMP(3) NOT NULL,
    "punchOutAt" TIMESTAMP(3),
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "earlyLeaveMinutes" INTEGER NOT NULL DEFAULT 0,
    "source" "StaffAttendanceSource" NOT NULL DEFAULT 'SELF',
    "approval" "StaffAttendanceApproval" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffAttendance_schoolId_userId_date_key" ON "StaffAttendance"("schoolId", "userId", "date");

-- CreateIndex
CREATE INDEX "StaffAttendance_schoolId_date_idx" ON "StaffAttendance"("schoolId", "date");

-- CreateIndex
CREATE INDEX "StaffAttendance_schoolId_approval_idx" ON "StaffAttendance"("schoolId", "approval");

-- AddForeignKey
ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Permissions. mark = punch yourself in/out and see your own history;
-- view = see everyone's attendance; approve = approve or reject it.
INSERT INTO "Permission" ("id", "key", "module", "action", "description") VALUES
  ('perm_staffattendance_mark',    'staffAttendance.mark',    'staffAttendance', 'mark',    'Punch in and out for yourself'),
  ('perm_staffattendance_view',    'staffAttendance.view',    'staffAttendance', 'view',    'View the whole staff''s attendance'),
  ('perm_staffattendance_approve', 'staffAttendance.approve', 'staffAttendance', 'approve', 'Approve or reject staff attendance')
ON CONFLICT ("key") DO NOTHING;

-- Directors and Principals do all three in every existing school…
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'ALL_SCHOOL', false
FROM "Role" r
JOIN "Permission" p ON p."key" IN ('staffAttendance.mark', 'staffAttendance.view', 'staffAttendance.approve')
WHERE r."name" IN ('Director', 'Principal') AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- …and teachers and office staff punch themselves in and out.
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'SELF', false
FROM "Role" r
JOIN "Permission" p ON p."key" = 'staffAttendance.mark'
WHERE r."name" IN ('Teacher', 'Accountant', 'Receptionist') AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
