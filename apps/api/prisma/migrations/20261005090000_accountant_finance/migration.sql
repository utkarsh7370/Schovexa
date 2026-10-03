-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSED');

-- CreateEnum
CREATE TYPE "ConcessionKind" AS ENUM ('DISCOUNT', 'SCHOLARSHIP', 'CONCESSION');

-- CreateEnum
CREATE TYPE "ConcessionStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'APPLIED');

-- CreateEnum
CREATE TYPE "FeeReminderKind" AS ENUM ('PAYMENT_CONFIRMATION', 'RECEIPT', 'DUE', 'OUTSTANDING', 'OVERDUE');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "correctedAt" TIMESTAMP(3),
ADD COLUMN     "correctedById" TEXT,
ADD COLUMN     "correctionReason" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "receivedFrom" TEXT,
ADD COLUMN     "reference" TEXT;

-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "lastPrintedAt" TIMESTAMP(3),
ADD COLUMN     "reprintCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SchoolSettings" ADD COLUMN     "maxDiscountPercent" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "notifyPaymentReceipt" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "paymentCorrectionWindowDays" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "photoKey" TEXT;

-- AlterTable
ALTER TABLE "StudentFee" ADD COLUMN     "discountMinor" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyByEmail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyInApp" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "RefundRequest" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "studentFeeId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "processedById" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Concession" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentFeeId" TEXT NOT NULL,
    "kind" "ConcessionKind" NOT NULL DEFAULT 'DISCOUNT',
    "name" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ConcessionStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "appliedById" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Concession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeReminder" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentFeeId" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" "FeeReminderKind" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "AbsenceAlertStatus" NOT NULL,
    "detail" TEXT,
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RefundRequest_schoolId_status_idx" ON "RefundRequest"("schoolId", "status");

-- CreateIndex
CREATE INDEX "RefundRequest_paymentId_idx" ON "RefundRequest"("paymentId");

-- CreateIndex
CREATE INDEX "RefundRequest_studentFeeId_idx" ON "RefundRequest"("studentFeeId");

-- CreateIndex
CREATE INDEX "Concession_schoolId_status_idx" ON "Concession"("schoolId", "status");

-- CreateIndex
CREATE INDEX "Concession_studentFeeId_idx" ON "Concession"("studentFeeId");

-- CreateIndex
CREATE INDEX "Concession_studentId_idx" ON "Concession"("studentId");

-- CreateIndex
CREATE INDEX "FeeReminder_schoolId_createdAt_idx" ON "FeeReminder"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "FeeReminder_studentFeeId_kind_createdAt_idx" ON "FeeReminder"("studentFeeId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_studentFeeId_fkey" FOREIGN KEY ("studentFeeId") REFERENCES "StudentFee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concession" ADD CONSTRAINT "Concession_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concession" ADD CONSTRAINT "Concession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concession" ADD CONSTRAINT "Concession_studentFeeId_fkey" FOREIGN KEY ("studentFeeId") REFERENCES "StudentFee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeReminder" ADD CONSTRAINT "FeeReminder_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeReminder" ADD CONSTRAINT "FeeReminder_studentFeeId_fkey" FOREIGN KEY ("studentFeeId") REFERENCES "StudentFee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- New finance permissions. Inserted here too so existing schools get working
-- access the moment this migration is deployed, with no manual re-seed step.
INSERT INTO "Permission" ("id", "key", "module", "action", "description") VALUES
  ('perm_finance_dashboard',     'finance.dashboard',      'finance',       'dashboard',  'View the finance dashboard'),
  ('perm_finance_student',       'finance.student',        'finance',       'student',    'Look up a student''s name, class, parents'' contact and fees (nothing academic)'),
  ('perm_finance_audit',         'finance.audit',          'finance',       'audit',      'View the finance activity log'),
  ('perm_payment_correct',       'payment.correct',        'payment',       'correct',    'Correct a recently recorded payment'),
  ('perm_payment_correct_any',   'payment.correctAny',     'payment',       'correctAny', 'Correct a payment at any time'),
  ('perm_receipt_view',          'receipt.view',           'receipt',       'view',       'View, download, print and reprint receipts'),
  ('perm_refund_view',           'refund.view',            'refund',        'view',       'View refund requests'),
  ('perm_refund_request',        'refund.request',         'refund',        'request',    'Request a refund'),
  ('perm_refund_approve',        'refund.approve',         'refund',        'approve',    'Approve or reject a refund request'),
  ('perm_refund_process',        'refund.process',         'refund',        'process',    'Pay out an approved refund'),
  ('perm_discount_view',         'discount.view',          'discount',      'view',       'View discounts, scholarships and concessions'),
  ('perm_discount_request',      'discount.request',       'discount',      'request',    'Request a discount, scholarship or concession'),
  ('perm_discount_apply',        'discount.apply',         'discount',      'apply',      'Apply a small discount or an approved concession'),
  ('perm_discount_approve',      'discount.approve',       'discount',      'approve',    'Approve or reject a concession request'),
  ('perm_financereport_view',    'financeReport.view',     'financeReport', 'view',       'View finance reports'),
  ('perm_financereport_export',  'financeReport.export',   'financeReport', 'export',     'Export finance data (CSV, Excel, PDF)'),
  ('perm_feenotice_send',        'feeNotice.send',         'feeNotice',     'send',       'Send fee reminders to families')
ON CONFLICT ("key") DO NOTHING;

-- Director and Principal get all of them in every existing school…
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'ALL_SCHOOL', false
FROM "Role" r
JOIN "Permission" p ON p."key" IN (
  'finance.dashboard','finance.student','finance.audit','payment.correct','payment.correctAny','receipt.view',
  'refund.view','refund.request','refund.approve','refund.process',
  'discount.view','discount.request','discount.apply','discount.approve',
  'financeReport.view','financeReport.export','feeNotice.send')
WHERE r."name" IN ('Director', 'Principal') AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- …the Accountant gets full operational finance access, but not approval,
-- not write-offs, and only limited student information…
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'ALL_SCHOOL', false
FROM "Role" r
JOIN "Permission" p ON p."key" IN (
  'finance.dashboard','finance.student','finance.audit','payment.correct','receipt.view',
  'refund.view','refund.request','refund.process',
  'discount.view','discount.request','discount.apply',
  'financeReport.view','financeReport.export','feeNotice.send')
WHERE r."name" = 'Accountant' AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- …and loses what was too broad: full student records (the finance student
-- lookup replaces it) and fee write-offs (a waiver is a refund in all but name).
DELETE FROM "RolePermission" rp
USING "Role" r, "Permission" p
WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
  AND r."name" = 'Accountant' AND r."isSystem" = true
  AND p."key" IN ('student.view', 'fee.refund');

-- Parents can see the receipts for their own children's payments.
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'OWN_CHILDREN', false
FROM "Role" r
JOIN "Permission" p ON p."key" = 'receipt.view'
WHERE r."name" = 'Parent' AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
