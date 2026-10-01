-- CreateEnum
CREATE TYPE "AbsenceAlertKind" AS ENUM ('ABSENT', 'CORRECTION');

-- CreateEnum
CREATE TYPE "AbsenceAlertStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- AlterTable: on by default for every school, existing ones included.
ALTER TABLE "School" ADD COLUMN "notifyParentsOnAbsence" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "AbsenceAlert" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "AbsenceAlertKind" NOT NULL DEFAULT 'ABSENT',
    "channel" "NotificationChannel" NOT NULL,
    "status" "AbsenceAlertStatus" NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbsenceAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AbsenceAlert_studentId_date_parentId_channel_kind_key" ON "AbsenceAlert"("studentId", "date", "parentId", "channel", "kind");

-- CreateIndex
CREATE INDEX "AbsenceAlert_schoolId_date_idx" ON "AbsenceAlert"("schoolId", "date");
