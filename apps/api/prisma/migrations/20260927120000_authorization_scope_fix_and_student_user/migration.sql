-- AlterEnum
BEGIN;
CREATE TYPE "PermissionScope_new" AS ENUM ('ALL_SCHOOL', 'OWN_CLASS', 'OWN_SUBJECT', 'OWN_STUDENTS', 'OWN_CHILDREN', 'SELF');
ALTER TABLE "RolePermission" ALTER COLUMN "scope" TYPE "PermissionScope_new" USING ("scope"::text::"PermissionScope_new");
ALTER TYPE "PermissionScope" RENAME TO "PermissionScope_old";
ALTER TYPE "PermissionScope_new" RENAME TO "PermissionScope";
DROP TYPE "PermissionScope_old";
COMMIT;

-- AlterTable
ALTER TABLE "RolePermission" ADD COLUMN     "readOnly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "Student_schoolId_userId_idx" ON "Student"("schoolId", "userId");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Finding F1 (docs/security-scalability-review.md), applied to the new
-- Student.userId column: a student should have at most one ACTIVE
-- profile per user per school, but Student carries deletedAt (soft
-- delete), so this is a partial unique index rather than a plain one —
-- same reasoning as the other F1-affected columns in the initial
-- migration.
CREATE UNIQUE INDEX "Student_schoolId_userId_active_key" ON "Student"("schoolId", "userId") WHERE "deletedAt" IS NULL AND "userId" IS NOT NULL;
