-- CreateEnum
CREATE TYPE "StudentSchoolDay" AS ENUM ('FULL_DAY', 'FIRST_HALF', 'SECOND_HALF');

-- AlterTable: every existing student attends the full day.
ALTER TABLE "Student" ADD COLUMN "schoolDay" "StudentSchoolDay" NOT NULL DEFAULT 'FULL_DAY';
