import { PrismaClient } from '@prisma/client';

// Deletes all rows created by any test in this suite, in FK-safe
// (children-first) order. Runs against schovexa_test only (see
// apps/api/.env.test) — never the dev database. Deliberately a SINGLE
// function used by every spec file: when tests from different modules
// share one Jest process (and one database), a narrower per-module reset
// that doesn't know about another module's tables leaves cross-file
// pollution — a leftover row from one file's last test breaks the next
// file's `beforeEach` with a foreign-key violation. One comprehensive
// function, extended as each new module's tests add tables, avoids that
// entire class of bug.
export async function resetTestData(prisma: PrismaClient): Promise<void> {
  await prisma.messageRecipient.deleteMany();
  await prisma.message.deleteMany();
  await prisma.studentRemark.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.schoolEvent.deleteMany();
  await prisma.markCorrection.deleteMany();
  await prisma.mark.deleteMany();
  await prisma.examPaper.deleteMany();
  await prisma.exam.deleteMany();
  await prisma.courseworkSubmission.deleteMany();
  await prisma.coursework.deleteMany();
  await prisma.learningContent.deleteMany();
  await prisma.timetableSubstitution.deleteMany();
  await prisma.timetableSlot.deleteMany();
  await prisma.attendanceCorrection.deleteMany();
  await prisma.studentGroupMember.deleteMany();
  await prisma.studentGroup.deleteMany();
  await prisma.contactMessage.deleteMany();
  await prisma.absenceAlert.deleteMany();
  await prisma.staffAttendance.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.document.deleteMany();
  await prisma.session.deleteMany();
  await prisma.authToken.deleteMany();
  await prisma.studentParent.deleteMany();
  await prisma.teacherAssignment.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.noticeRead.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.notice.deleteMany();
  await prisma.feeReminder.deleteMany();
  await prisma.refundRequest.deleteMany();
  await prisma.concession.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.studentFee.deleteMany();
  await prisma.feeStructure.deleteMany();
  await prisma.feeCategory.deleteMany();
  await prisma.student.deleteMany();
  await prisma.section.deleteMany();
  await prisma.class.deleteMany();
  await prisma.academicYearReview.deleteMany();
  await prisma.academicTerm.deleteMany();
  await prisma.gradeBand.deleteMany();
  await prisma.schoolSettings.deleteMany();
  await prisma.academicYear.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.department.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.parent.deleteMany();
  await prisma.schoolMembership.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.school.deleteMany();
  await prisma.user.deleteMany();
}

// Attendance can't be marked on a day the school is closed, and the default
// week is Monday–Saturday — so a test that marks attendance "today" would
// fail whenever it happens to run on a Sunday. Tests that mark attendance
// open the whole week first; the weekly-off rule has its own tests.
export async function openAllWeek(prisma: PrismaClient, schoolId: string): Promise<void> {
  await prisma.schoolSettings.upsert({
    where: { schoolId },
    create: { schoolId, workingDays: [1, 2, 3, 4, 5, 6, 7] },
    update: { workingDays: [1, 2, 3, 4, 5, 6, 7] },
  });
}
