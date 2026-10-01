-- CreateEnum
CREATE TYPE "AcademicYearStatus" AS ENUM ('PENDING_APPROVAL', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AcademicYearReviewAction" AS ENUM ('SUBMITTED', 'RESUBMITTED', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'EXPIRED');

-- AlterTable: every year that exists today was created without an approval
-- step, so it is APPROVED. (Years already past their end date are marked
-- EXPIRED the first time anyone opens Academic Years.)
ALTER TABLE "AcademicYear" ADD COLUMN "status" "AcademicYearStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "createdById" TEXT,
ADD COLUMN "decidedById" TEXT,
ADD COLUMN "decidedAt" TIMESTAMP(3),
ADD COLUMN "decisionNote" TEXT;

-- CreateTable
CREATE TABLE "AcademicYearReview" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "action" "AcademicYearReviewAction" NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademicYearReview_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "link" TEXT;

-- CreateIndex
CREATE INDEX "AcademicYear_schoolId_status_idx" ON "AcademicYear"("schoolId", "status");

-- CreateIndex
CREATE INDEX "AcademicYearReview_academicYearId_createdAt_idx" ON "AcademicYearReview"("academicYearId", "createdAt");

-- CreateIndex
CREATE INDEX "AcademicYearReview_schoolId_idx" ON "AcademicYearReview"("schoolId");

-- AddForeignKey
ALTER TABLE "AcademicYearReview" ADD CONSTRAINT "AcademicYearReview_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The permission that lets someone approve, reject or send back a proposed
-- academic year. Directors get it in every existing school; the Principal
-- role deliberately does not (they propose, the Director decides).
INSERT INTO "Permission" ("id", "key", "module", "action", "description") VALUES
  ('perm_academicyear_approve', 'academicYear.approve', 'academicYear', 'approve', 'Approve, reject or send back a proposed academic year')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'ALL_SCHOOL', false
FROM "Role" r
JOIN "Permission" p ON p."key" = 'academicYear.approve'
WHERE r."name" = 'Director' AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
