-- CreateEnum
CREATE TYPE "GroupKind" AS ENUM ('HOUSE', 'CLUB', 'SPORTS', 'OTHER');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "category" TEXT;

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "affiliationNo" TEXT,
ADD COLUMN     "alternatePhone" TEXT,
ADD COLUMN     "board" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "establishedYear" INTEGER,
ADD COLUMN     "logoKey" TEXT,
ADD COLUMN     "motto" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "schoolCode" TEXT,
ADD COLUMN     "schoolType" TEXT,
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "departmentId" TEXT;

-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN     "departmentId" TEXT;

-- CreateTable
CREATE TABLE "AcademicTerm" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AcademicTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolSettings" (
    "schoolId" TEXT NOT NULL,
    "schoolStartTime" TEXT NOT NULL DEFAULT '08:00',
    "schoolEndTime" TEXT NOT NULL DEFAULT '14:30',
    "breakStartTime" TEXT DEFAULT '11:00',
    "breakEndTime" TEXT DEFAULT '11:30',
    "workingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
    "offSaturdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "attendanceEditWindowDays" INTEGER NOT NULL DEFAULT 0,
    "attendanceMinPercent" INTEGER NOT NULL DEFAULT 75,
    "attendanceOnNonWorkingDays" BOOLEAN NOT NULL DEFAULT false,
    "receiptPrefix" TEXT NOT NULL DEFAULT '',
    "allowPartialPayments" BOOLEAN NOT NULL DEFAULT true,
    "lateFeePerDayMinor" INTEGER NOT NULL DEFAULT 0,
    "lateFeeGraceDays" INTEGER NOT NULL DEFAULT 0,
    "passPercent" INTEGER NOT NULL DEFAULT 40,
    "notifyAbsenceEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyYearApprovalEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyStaffAttendanceDecisions" BOOLEAN NOT NULL DEFAULT true,
    "documentMaxSizeMb" INTEGER NOT NULL DEFAULT 10,
    "allowedDocumentTypes" TEXT[] DEFAULT ARRAY['application/pdf', 'image/jpeg', 'image/png']::TEXT[],
    "documentCategories" TEXT[] DEFAULT ARRAY['ID proof', 'Birth certificate', 'Transfer certificate', 'Address proof', 'Medical record', 'Certificate', 'Other']::TEXT[],
    "requiredStudentDocuments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolSettings_pkey" PRIMARY KEY ("schoolId")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "headTeacherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentGroup" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "GroupKind" NOT NULL DEFAULT 'HOUSE',
    "color" TEXT NOT NULL DEFAULT '#2563eb',
    "motto" TEXT,
    "description" TEXT,
    "leaderTeacherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StudentGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentGroupMember" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeBand" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "minPercent" INTEGER NOT NULL,
    "gradePoint" DOUBLE PRECISION,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GradeBand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademicTerm_academicYearId_startDate_idx" ON "AcademicTerm"("academicYearId", "startDate");

-- CreateIndex
CREATE INDEX "AcademicTerm_schoolId_idx" ON "AcademicTerm"("schoolId");

-- CreateIndex
CREATE INDEX "Department_schoolId_name_idx" ON "Department"("schoolId", "name");

-- CreateIndex
CREATE INDEX "Department_schoolId_idx" ON "Department"("schoolId");

-- CreateIndex
CREATE INDEX "StudentGroup_schoolId_name_idx" ON "StudentGroup"("schoolId", "name");

-- CreateIndex
CREATE INDEX "StudentGroup_schoolId_idx" ON "StudentGroup"("schoolId");

-- CreateIndex
CREATE INDEX "StudentGroupMember_schoolId_idx" ON "StudentGroupMember"("schoolId");

-- CreateIndex
CREATE INDEX "StudentGroupMember_studentId_idx" ON "StudentGroupMember"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentGroupMember_groupId_studentId_key" ON "StudentGroupMember"("groupId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "GradeBand_schoolId_minPercent_key" ON "GradeBand"("schoolId", "minPercent");

-- CreateIndex
CREATE UNIQUE INDEX "GradeBand_schoolId_label_key" ON "GradeBand"("schoolId", "label");

-- CreateIndex
CREATE INDEX "Subject_departmentId_idx" ON "Subject"("departmentId");

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicTerm" ADD CONSTRAINT "AcademicTerm_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicTerm" ADD CONSTRAINT "AcademicTerm_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolSettings" ADD CONSTRAINT "SchoolSettings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_headTeacherId_fkey" FOREIGN KEY ("headTeacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGroup" ADD CONSTRAINT "StudentGroup_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGroup" ADD CONSTRAINT "StudentGroup_leaderTeacherId_fkey" FOREIGN KEY ("leaderTeacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGroupMember" ADD CONSTRAINT "StudentGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StudentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGroupMember" ADD CONSTRAINT "StudentGroupMember_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeBand" ADD CONSTRAINT "GradeBand_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Unique names among live rows (same pattern as Subject/Class).
CREATE UNIQUE INDEX "Department_schoolId_name_active_key" ON "Department"("schoolId", lower("name")) WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "StudentGroup_schoolId_name_active_key" ON "StudentGroup"("schoolId", lower("name")) WHERE "deletedAt" IS NULL;

-- New permissions. Inserted here too so existing schools get working
-- access the moment this migration is deployed, with no manual re-seed.
INSERT INTO "Permission" ("id", "key", "module", "action", "description") VALUES
  ('perm_department_view',   'department.view',   'department', 'view',   'View departments'),
  ('perm_department_create', 'department.create', 'department', 'create', 'Create a department'),
  ('perm_department_update', 'department.update', 'department', 'update', 'Edit or remove a department'),
  ('perm_group_view',        'group.view',        'group',      'view',   'View houses and groups'),
  ('perm_group_create',      'group.create',      'group',      'create', 'Create a house or group'),
  ('perm_group_update',      'group.update',      'group',      'update', 'Edit a house or group and manage its members')
ON CONFLICT ("key") DO NOTHING;

-- Directors and Principals manage them in every existing school…
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'ALL_SCHOOL', false
FROM "Role" r
JOIN "Permission" p ON p."key" IN ('department.view', 'department.create', 'department.update', 'group.view', 'group.create', 'group.update')
WHERE r."name" IN ('Director', 'Principal') AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- …and teachers can see them.
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'ALL_SCHOOL', false
FROM "Role" r
JOIN "Permission" p ON p."key" IN ('department.view', 'group.view')
WHERE r."name" = 'Teacher' AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
