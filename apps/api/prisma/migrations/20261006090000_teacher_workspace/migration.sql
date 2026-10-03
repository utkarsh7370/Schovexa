-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CourseworkKind" AS ENUM ('HOMEWORK', 'ASSIGNMENT');

-- CreateEnum
CREATE TYPE "CourseworkStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'SUBMITTED', 'REVIEWED', 'RESUBMIT');

-- CreateEnum
CREATE TYPE "MarksStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'REVIEWED', 'APPROVED', 'PUBLISHED', 'CORRECTION');

-- CreateEnum
CREATE TYPE "ContentKind" AS ENUM ('NOTE', 'PDF', 'VIDEO', 'LINK', 'WORKSHEET', 'PRACTICE');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RemarkKind" AS ENUM ('ACADEMIC', 'BEHAVIOUR', 'STRENGTH', 'WEAK_AREA', 'PARTICIPATION', 'HOMEWORK', 'OBSERVATION', 'RECOMMENDATION');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('ANNOUNCEMENT', 'HOMEWORK', 'ASSIGNMENT', 'FEEDBACK', 'STUDENT', 'QUERY', 'REPLY');

-- CreateEnum
CREATE TYPE "LeaveKind" AS ENUM ('CASUAL', 'SICK', 'EARNED', 'UNPAID', 'OTHER');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventKind" AS ENUM ('EVENT', 'MEETING', 'PARENT_TEACHER');

-- AlterEnum
ALTER TYPE "AttendanceStatus" ADD VALUE 'HALF_DAY';

-- AlterTable
ALTER TABLE "Notice" ADD COLUMN     "scheduledFor" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SchoolSettings" ADD COLUMN     "leaveAllowances" JSONB NOT NULL DEFAULT '{"CASUAL":12,"SICK":10,"EARNED":15}',
ADD COLUMN     "shareRemarksWithParents" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "teacherDocumentCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "teachersSeeParentContact" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "rollNo" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "photoKey" TEXT;

-- CreateTable
CREATE TABLE "AttendanceCorrection" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "fromStatus" "AttendanceStatus",
    "toStatus" "AttendanceStatus" NOT NULL,
    "remarks" TEXT,
    "reason" TEXT NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableSlot" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "room" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimetableSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableSubstitution" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "substituteTeacherId" TEXT NOT NULL,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimetableSubstitution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coursework" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "kind" "CourseworkKind" NOT NULL,
    "sectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" DATE NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "maxMarks" INTEGER,
    "studentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "CourseworkStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coursework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseworkSubmission" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "courseworkId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3),
    "marks" DOUBLE PRECISION,
    "feedback" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseworkSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamPaper" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "date" DATE,
    "startTime" TEXT,
    "endTime" TEXT,
    "room" TEXT,
    "maxMarks" INTEGER NOT NULL DEFAULT 100,
    "status" "MarksStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "returnNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamPaper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mark" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "marks" DOUBLE PRECISION,
    "absent" BOOLEAN NOT NULL DEFAULT false,
    "remark" TEXT,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarkCorrection" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarkCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningContent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "kind" "ContentKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentRemark" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT,
    "kind" "RemarkKind" NOT NULL DEFAULT 'OBSERVATION',
    "body" TEXT NOT NULL,
    "visibleToParents" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StudentRemark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "kind" "MessageKind" NOT NULL,
    "senderId" TEXT NOT NULL,
    "studentId" TEXT,
    "sectionId" TEXT,
    "subjectId" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "replyToId" TEXT,
    "threadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageRecipient" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "MessageRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "LeaveKind" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "halfDay" BOOLEAN NOT NULL DEFAULT false,
    "days" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolEvent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "kind" "EventKind" NOT NULL DEFAULT 'EVENT',
    "title" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "location" TEXT,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SchoolEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceCorrection_schoolId_status_idx" ON "AttendanceCorrection"("schoolId", "status");

-- CreateIndex
CREATE INDEX "AttendanceCorrection_sectionId_date_idx" ON "AttendanceCorrection"("sectionId", "date");

-- CreateIndex
CREATE INDEX "TimetableSlot_schoolId_idx" ON "TimetableSlot"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableSlot_sectionId_dayOfWeek_period_key" ON "TimetableSlot"("sectionId", "dayOfWeek", "period");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableSlot_teacherId_dayOfWeek_period_key" ON "TimetableSlot"("teacherId", "dayOfWeek", "period");

-- CreateIndex
CREATE INDEX "TimetableSubstitution_schoolId_date_idx" ON "TimetableSubstitution"("schoolId", "date");

-- CreateIndex
CREATE INDEX "TimetableSubstitution_substituteTeacherId_date_idx" ON "TimetableSubstitution"("substituteTeacherId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableSubstitution_slotId_date_key" ON "TimetableSubstitution"("slotId", "date");

-- CreateIndex
CREATE INDEX "Coursework_schoolId_kind_dueDate_idx" ON "Coursework"("schoolId", "kind", "dueDate");

-- CreateIndex
CREATE INDEX "Coursework_sectionId_dueDate_idx" ON "Coursework"("sectionId", "dueDate");

-- CreateIndex
CREATE INDEX "CourseworkSubmission_schoolId_idx" ON "CourseworkSubmission"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseworkSubmission_courseworkId_studentId_key" ON "CourseworkSubmission"("courseworkId", "studentId");

-- CreateIndex
CREATE INDEX "Exam_schoolId_startDate_idx" ON "Exam"("schoolId", "startDate");

-- CreateIndex
CREATE INDEX "ExamPaper_schoolId_status_idx" ON "ExamPaper"("schoolId", "status");

-- CreateIndex
CREATE INDEX "ExamPaper_sectionId_date_idx" ON "ExamPaper"("sectionId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ExamPaper_examId_sectionId_subjectId_key" ON "ExamPaper"("examId", "sectionId", "subjectId");

-- CreateIndex
CREATE INDEX "Mark_schoolId_idx" ON "Mark"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Mark_paperId_studentId_key" ON "Mark"("paperId", "studentId");

-- CreateIndex
CREATE INDEX "MarkCorrection_schoolId_status_idx" ON "MarkCorrection"("schoolId", "status");

-- CreateIndex
CREATE INDEX "LearningContent_schoolId_status_idx" ON "LearningContent"("schoolId", "status");

-- CreateIndex
CREATE INDEX "LearningContent_sectionId_subjectId_idx" ON "LearningContent"("sectionId", "subjectId");

-- CreateIndex
CREATE INDEX "StudentRemark_studentId_createdAt_idx" ON "StudentRemark"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "StudentRemark_schoolId_idx" ON "StudentRemark"("schoolId");

-- CreateIndex
CREATE INDEX "Message_schoolId_createdAt_idx" ON "Message"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_threadId_idx" ON "Message"("threadId");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- CreateIndex
CREATE INDEX "MessageRecipient_userId_readAt_idx" ON "MessageRecipient"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageRecipient_messageId_userId_key" ON "MessageRecipient"("messageId", "userId");

-- CreateIndex
CREATE INDEX "LeaveRequest_schoolId_status_idx" ON "LeaveRequest"("schoolId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_userId_startDate_idx" ON "LeaveRequest"("userId", "startDate");

-- CreateIndex
CREATE INDEX "SchoolEvent_schoolId_startDate_idx" ON "SchoolEvent"("schoolId", "startDate");

-- AddForeignKey
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSubstitution" ADD CONSTRAINT "TimetableSubstitution_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSubstitution" ADD CONSTRAINT "TimetableSubstitution_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "TimetableSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSubstitution" ADD CONSTRAINT "TimetableSubstitution_substituteTeacherId_fkey" FOREIGN KEY ("substituteTeacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coursework" ADD CONSTRAINT "Coursework_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coursework" ADD CONSTRAINT "Coursework_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coursework" ADD CONSTRAINT "Coursework_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseworkSubmission" ADD CONSTRAINT "CourseworkSubmission_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseworkSubmission" ADD CONSTRAINT "CourseworkSubmission_courseworkId_fkey" FOREIGN KEY ("courseworkId") REFERENCES "Coursework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseworkSubmission" ADD CONSTRAINT "CourseworkSubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "ExamPaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkCorrection" ADD CONSTRAINT "MarkCorrection_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkCorrection" ADD CONSTRAINT "MarkCorrection_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "ExamPaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningContent" ADD CONSTRAINT "LearningContent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningContent" ADD CONSTRAINT "LearningContent_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningContent" ADD CONSTRAINT "LearningContent_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentRemark" ADD CONSTRAINT "StudentRemark_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentRemark" ADD CONSTRAINT "StudentRemark_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageRecipient" ADD CONSTRAINT "MessageRecipient_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolEvent" ADD CONSTRAINT "SchoolEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- New teaching permissions. Inserted here too so existing schools get working access the
-- moment this migration is deployed, with no manual re-seed step.
INSERT INTO "Permission" ("id", "key", "module", "action", "description") VALUES
  ('perm_attendance_requestcorrection', 'attendance.requestCorrection', 'attendance', 'requestCorrection', 'Ask for a locked attendance record to be corrected'),
  ('perm_attendance_approvecorrection', 'attendance.approveCorrection', 'attendance', 'approveCorrection', 'Approve or reject an attendance correction request'),
  ('perm_timetable_view', 'timetable.view', 'timetable', 'view', 'View timetables'),
  ('perm_timetable_manage', 'timetable.manage', 'timetable', 'manage', 'Create and change the master timetable and substitutions'),
  ('perm_homework_view', 'homework.view', 'homework', 'view', 'View homework'),
  ('perm_homework_create', 'homework.create', 'homework', 'create', 'Set, edit and cancel homework'),
  ('perm_homework_review', 'homework.review', 'homework', 'review', 'Record, review and comment on homework submissions'),
  ('perm_assignment_view', 'assignment.view', 'assignment', 'view', 'View assignments'),
  ('perm_assignment_create', 'assignment.create', 'assignment', 'create', 'Set, edit and cancel assignments'),
  ('perm_assignment_evaluate', 'assignment.evaluate', 'assignment', 'evaluate', 'Evaluate assignment submissions: marks and feedback'),
  ('perm_exam_view', 'exam.view', 'exam', 'view', 'View exams and their timetable'),
  ('perm_exam_manage', 'exam.manage', 'exam', 'manage', 'Create exams and exam papers'),
  ('perm_marks_view', 'marks.view', 'marks', 'view', 'View marks'),
  ('perm_marks_enter', 'marks.enter', 'marks', 'enter', 'Enter, submit and ask to correct marks'),
  ('perm_marks_review', 'marks.review', 'marks', 'review', 'Review submitted marks (academic coordinator)'),
  ('perm_marks_approve', 'marks.approve', 'marks', 'approve', 'Approve, publish and reopen marks'),
  ('perm_result_view', 'result.view', 'result', 'view', 'View published results'),
  ('perm_content_view', 'content.view', 'content', 'view', 'View study material'),
  ('perm_content_create', 'content.create', 'content', 'create', 'Create, publish and archive study material'),
  ('perm_remark_view', 'remark.view', 'remark', 'view', 'View teacher remarks and observations'),
  ('perm_remark_create', 'remark.create', 'remark', 'create', 'Write teacher remarks and observations'),
  ('perm_message_view', 'message.view', 'message', 'view', 'Read teacher–parent messages'),
  ('perm_message_send', 'message.send', 'message', 'send', 'Send teacher–parent messages'),
  ('perm_leave_apply', 'leave.apply', 'leave', 'apply', 'Apply for leave and see your own requests'),
  ('perm_leave_view', 'leave.view', 'leave', 'view', 'View everyone’s leave requests'),
  ('perm_leave_approve', 'leave.approve', 'leave', 'approve', 'Approve or reject leave requests'),
  ('perm_event_view', 'event.view', 'event', 'view', 'View school events and meetings'),
  ('perm_event_manage', 'event.manage', 'event', 'manage', 'Add and edit school events and meetings'),
  ('perm_teachingreport_view', 'teachingReport.view', 'teachingReport', 'view', 'View attendance, homework, assignment and marks reports'),
  ('perm_teachingreport_export', 'teachingReport.export', 'teachingReport', 'export', 'Export those reports'),
  ('perm_teaching_dashboard', 'teaching.dashboard', 'teaching', 'dashboard', 'View the teaching dashboard')
ON CONFLICT ("key") DO NOTHING;

-- Director and Principal get every new permission in every existing school.
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'ALL_SCHOOL', false
FROM "Role" r
JOIN "Permission" p ON p."key" IN ('timetable.view','timetable.manage','homework.view','homework.create','homework.review','assignment.view','assignment.create','assignment.evaluate','exam.view','exam.manage','marks.view','marks.enter','marks.review','marks.approve','result.view','content.view','content.create','remark.view','remark.create','message.view','message.send','leave.apply','leave.view','leave.approve','event.view','event.manage','teachingReport.view','teachingReport.export','teaching.dashboard','attendance.requestCorrection','attendance.approveCorrection')
WHERE r."name" IN ('Director', 'Principal') AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Teacher
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'SELF', false
FROM "Role" r
JOIN "Permission" p ON p."key" IN ('teaching.dashboard','leave.apply')
WHERE r."name" = 'Teacher' AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'OWN_CLASS', false
FROM "Role" r
JOIN "Permission" p ON p."key" IN ('attendance.requestCorrection','timetable.view','teachingReport.view','teachingReport.export')
WHERE r."name" = 'Teacher' AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'OWN_SUBJECT', false
FROM "Role" r
JOIN "Permission" p ON p."key" IN ('homework.view','homework.create','homework.review','assignment.view','assignment.create','assignment.evaluate','exam.view','marks.view','marks.enter','content.view','content.create')
WHERE r."name" = 'Teacher' AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'OWN_STUDENTS', false
FROM "Role" r
JOIN "Permission" p ON p."key" IN ('result.view','remark.view','remark.create','message.view','message.send')
WHERE r."name" = 'Teacher' AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'ALL_SCHOOL', false
FROM "Role" r
JOIN "Permission" p ON p."key" IN ('event.view')
WHERE r."name" = 'Teacher' AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Accountant
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'SELF', false
FROM "Role" r
JOIN "Permission" p ON p."key" IN ('leave.apply')
WHERE r."name" = 'Accountant' AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'ALL_SCHOOL', false
FROM "Role" r
JOIN "Permission" p ON p."key" IN ('event.view')
WHERE r."name" = 'Accountant' AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Receptionist
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'SELF', false
FROM "Role" r
JOIN "Permission" p ON p."key" IN ('leave.apply')
WHERE r."name" = 'Receptionist' AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'ALL_SCHOOL', false
FROM "Role" r
JOIN "Permission" p ON p."key" IN ('event.view')
WHERE r."name" = 'Receptionist' AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Parent
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'OWN_CHILDREN', false
FROM "Role" r
JOIN "Permission" p ON p."key" IN ('homework.view','assignment.view','content.view','result.view','remark.view','message.view','message.send')
WHERE r."name" = 'Parent' AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'ALL_SCHOOL', false
FROM "Role" r
JOIN "Permission" p ON p."key" IN ('event.view')
WHERE r."name" = 'Parent' AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Teachers could not create notices before; they now can, for their own classes only.

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'OWN_CLASS', false
FROM "Role" r
JOIN "Permission" p ON p."key" IN ('notice.create', 'notice.publish')
WHERE r."name" = 'Teacher' AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- …and may open the permitted documents of their own students (which categories is a school setting).
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'OWN_STUDENTS', false
FROM "Role" r
JOIN "Permission" p ON p."key" = 'document.view'
WHERE r."name" = 'Teacher' AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
