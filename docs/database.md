# Schovexa — Database / ERD Design

Status: Step 2 design deliverable. This is the ERD and field-level design
that the Phase 2 implementation step (Prisma schema) will be generated
from. Schema shown as Prisma-flavored pseudocode for precision — no
`prisma/schema.prisma` file is created yet; that is implementation
(Step 6), not design.

Conventions used throughout:
- `id` — `String @id @default(cuid())` on every table.
- `createdAt` / `updatedAt` — on every table.
- `deletedAt DateTime?` — soft-delete marker, present wherever
  `docs/architecture.md` §7 calls for soft deletion.
- `schoolId` — present on every school-owned table, `onDelete: Restrict`
  (a school with data cannot be hard-deleted; deactivate instead).
- Money stored as integer minor units (paise/cents) — never floating
  point.

## 1. Entity Overview

```
Platform-global:  User, Plan, Feature, Subscription (School-owned:
                   SchoolFeature links a School's Subscription to Features)

School-owned:      School, SchoolMembership, Role, Permission,
                   RolePermission, AcademicYear, Class, Section, Subject,
                   TeacherAssignment, Teacher, Student, Parent,
                   StudentParent, Attendance, FeeCategory, FeeStructure,
                   StudentFee, Payment, Receipt, Notice, Notification,
                   Document, AuditLog
```

`Permission` is a global catalog (the `module.action` strings are the
same across all schools); `RolePermission` is what's school-scoped (a
school's `Role` grants a subset of the global `Permission` catalog with a
chosen scope).

## 2. Identity & Tenancy

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String
  firstName     String
  lastName      String
  phone         String?
  status        UserStatus @default(INVITED) // INVITED, ACTIVE, SUSPENDED, DISABLED, DELETED
  emailVerifiedAt DateTime?
  lastLoginAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  memberships   SchoolMembership[]
  auditLogs     AuditLog[]           // as actor
}

model School {
  id            String    @id @default(cuid())
  name          String
  slug          String    @unique          // for future subdomain routing
  logoUrl       String?
  address       String?
  contactEmail  String?
  contactPhone  String?
  website       String?
  timezone      String    @default("Asia/Kolkata")
  currency      String    @default("INR")
  dateFormat    String    @default("DD/MM/YYYY")
  status        SchoolStatus @default(ACTIVE) // ACTIVE, SUSPENDED, DELETED
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  memberships   SchoolMembership[]
  roles         Role[]
  academicYears AcademicYear[]
  subscription  Subscription?
  // ...one relation per school-owned entity below
}

model SchoolMembership {
  id            String    @id @default(cuid())
  userId        String
  schoolId      String
  roleId        String
  status        MembershipStatus @default(ACTIVE) // ACTIVE, SUSPENDED, DISABLED
  isPrimary     Boolean   @default(true)  // MVP: one active membership assumed per session
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  user          User      @relation(fields: [userId], references: [id])
  school        School    @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  role          Role      @relation(fields: [roleId], references: [id])

  @@unique([userId, schoolId])   // one membership per user per school
  @@index([schoolId])
  @@index([userId])
}
```

## 3. RBAC / Permissions

```prisma
model Permission {
  id      String @id @default(cuid())
  key     String @unique   // e.g. "student.view"
  module  String            // e.g. "student"
  action  String            // e.g. "view"
  description String?

  rolePermissions RolePermission[]
}

model Role {
  id          String   @id @default(cuid())
  schoolId    String?  // null for platform roles
  name        String
  isSystem    Boolean  @default(false) // seeded default vs school-custom
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?

  school      School?  @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  permissions RolePermission[]
  memberships SchoolMembership[]

  @@unique([schoolId, name])
  @@index([schoolId])
}

model RolePermission {
  id            String     @id @default(cuid())
  roleId        String
  permissionId  String
  scope         PermissionScope // ALL_SCHOOL, OWN_CLASS, OWN_SUBJECT, OWN_STUDENTS, OWN_CHILDREN, SELF, READ_ONLY

  role          Role       @relation(fields: [roleId], references: [id])
  permission    Permission @relation(fields: [permissionId], references: [id])

  @@unique([roleId, permissionId])
  @@index([roleId])
}
```

`Permission` rows are seeded once (platform-level catalog, not editable
per school). `Role`/`RolePermission` rows are seeded per school on
onboarding and are then customizable.

## 4. Academic Structure

```prisma
model AcademicYear {
  id         String   @id @default(cuid())
  schoolId   String
  name       String            // "2025-26"
  startDate  DateTime
  endDate    DateTime
  isCurrent  Boolean  @default(false)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  deletedAt  DateTime?

  school     School   @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  classes    Class[]

  @@unique([schoolId, name])
  @@index([schoolId])
}

model Class {
  id             String   @id @default(cuid())
  schoolId       String
  academicYearId String
  name           String            // "Grade 6"
  order          Int               // for display sorting
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  deletedAt      DateTime?

  school         School       @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  academicYear   AcademicYear @relation(fields: [academicYearId], references: [id], onDelete: Restrict)
  sections       Section[]

  @@unique([academicYearId, name])
  @@index([schoolId])
}

model Section {
  id            String   @id @default(cuid())
  schoolId      String
  classId       String
  name          String            // "A"
  classTeacherId String?          // -> Teacher.id
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  deletedAt     DateTime?

  school        School   @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  class         Class    @relation(fields: [classId], references: [id], onDelete: Restrict)
  classTeacher  Teacher? @relation("ClassTeacherOf", fields: [classTeacherId], references: [id])
  students      Student[]
  assignments   TeacherAssignment[]
  attendance    Attendance[]

  @@unique([classId, name])
  @@index([schoolId])
}

model Subject {
  id         String   @id @default(cuid())
  schoolId   String
  name       String
  code       String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  deletedAt  DateTime?

  school     School   @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  assignments TeacherAssignment[]

  @@unique([schoolId, name])
  @@index([schoolId])
}

model Teacher {
  id         String   @id @default(cuid())
  schoolId   String
  userId     String            // linked SchoolMembership's user
  employeeCode String?
  joiningDate  DateTime?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  deletedAt  DateTime?

  school     School   @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  user       User     @relation(fields: [userId], references: [id])
  assignments TeacherAssignment[]
  classTeacherOf Section[] @relation("ClassTeacherOf")

  @@unique([schoolId, userId])
  @@index([schoolId])
}

// Resolves OWN_CLASS / OWN_SUBJECT scope checks
model TeacherAssignment {
  id         String   @id @default(cuid())
  schoolId   String
  teacherId  String
  sectionId  String
  subjectId  String
  createdAt  DateTime @default(now())
  deletedAt  DateTime?

  school     School   @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  teacher    Teacher  @relation(fields: [teacherId], references: [id])
  section    Section  @relation(fields: [sectionId], references: [id])
  subject    Subject  @relation(fields: [subjectId], references: [id])

  @@unique([teacherId, sectionId, subjectId])
  @@index([schoolId])
  @@index([sectionId])
  @@index([teacherId])
}
```

`TeacherAssignment` is the table the `authorize()` scope resolver queries
to answer "is this section/subject one this teacher is assigned to" for
`OWN_CLASS`/`OWN_SUBJECT` scopes (see `docs/authorization.md`).

## 5. Students & Parents

```prisma
model Student {
  id             String   @id @default(cuid())
  schoolId       String
  admissionNo    String
  firstName      String
  lastName       String
  dateOfBirth    DateTime?
  gender         String?
  sectionId      String?
  status         StudentStatus @default(ENROLLED) // ENROLLED, TRANSFERRED, GRADUATED, WITHDRAWN
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  deletedAt      DateTime?

  school         School   @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  section        Section? @relation(fields: [sectionId], references: [id])
  parents        StudentParent[]
  attendance     Attendance[]
  fees           StudentFee[]
  documents      Document[]

  @@unique([schoolId, admissionNo])
  @@index([schoolId])
  @@index([sectionId])
}

model Parent {
  id         String   @id @default(cuid())
  schoolId   String
  userId     String?           // nullable: a parent record can exist before portal account is created
  firstName  String
  lastName   String
  phone      String?
  email      String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  deletedAt  DateTime?

  school     School   @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  user       User?    @relation(fields: [userId], references: [id])
  children   StudentParent[]

  @@index([schoolId])
}

model StudentParent {
  id         String   @id @default(cuid())
  schoolId   String
  studentId  String
  parentId   String
  relation   String            // "father", "mother", "guardian"
  isPrimary  Boolean  @default(false)

  school     School   @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  student    Student  @relation(fields: [studentId], references: [id])
  parent     Parent   @relation(fields: [parentId], references: [id])

  @@unique([studentId, parentId])
  @@index([schoolId])
  @@index([parentId])   // resolves OWN_CHILDREN scope
}
```

`StudentParent` is what the `authorize()` scope resolver queries for
`OWN_CHILDREN`.

## 6. Attendance

```prisma
model Attendance {
  id         String   @id @default(cuid())
  schoolId   String
  studentId  String
  sectionId  String
  date       DateTime  @db.Date
  status     AttendanceStatus  // PRESENT, ABSENT, LATE, EXCUSED
  markedById String            // User.id of the teacher who marked it
  remarks    String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  school     School   @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  student    Student  @relation(fields: [studentId], references: [id])
  section    Section  @relation(fields: [sectionId], references: [id])

  @@unique([studentId, date])   // one attendance record per student per day
  @@index([schoolId, date])
  @@index([sectionId, date])
}
```

No soft delete needed — attendance is corrected via an audited update,
not deletion; `AuditLog` captures the change history.

## 7. Fees & Payments

```prisma
model FeeCategory {
  id         String   @id @default(cuid())
  schoolId   String
  name       String            // "Tuition", "Transport"
  createdAt  DateTime @default(now())
  deletedAt  DateTime?

  school     School   @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  structures FeeStructure[]

  @@unique([schoolId, name])
  @@index([schoolId])
}

model FeeStructure {
  id            String   @id @default(cuid())
  schoolId      String
  feeCategoryId String
  academicYearId String
  classId       String?           // null = applies to all classes
  amountMinor   Int               // integer minor units
  frequency     FeeFrequency      // ONE_TIME, MONTHLY, QUARTERLY, ANNUAL
  createdAt     DateTime @default(now())
  deletedAt     DateTime?

  school        School      @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  feeCategory   FeeCategory @relation(fields: [feeCategoryId], references: [id])
  academicYear  AcademicYear @relation(fields: [academicYearId], references: [id])

  @@index([schoolId])
}

model StudentFee {
  id             String   @id @default(cuid())
  schoolId       String
  studentId      String
  feeStructureId String
  amountDueMinor Int
  dueDate        DateTime?
  status         StudentFeeStatus @default(PENDING) // PENDING, PARTIALLY_PAID, PAID, WAIVED
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  deletedAt      DateTime?

  school         School       @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  student        Student      @relation(fields: [studentId], references: [id])
  feeStructure   FeeStructure @relation(fields: [feeStructureId], references: [id])
  payments       Payment[]

  @@index([schoolId])
  @@index([studentId])
}

model Payment {
  id             String   @id @default(cuid())
  schoolId       String
  studentFeeId   String
  amountMinor    Int
  method         PaymentMethod  // CASH, CHEQUE, BANK_TRANSFER, ONLINE (Phase 2)
  collectedById  String            // User.id of accountant/staff
  paidAt         DateTime @default(now())
  createdAt      DateTime @default(now())
  deletedAt      DateTime?         // refund handled as a status, not a hard delete

  school         School     @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  studentFee     StudentFee @relation(fields: [studentFeeId], references: [id])
  receipt        Receipt?

  @@index([schoolId])
  @@index([studentFeeId])
}

model Receipt {
  id           String   @id @default(cuid())
  schoolId     String
  paymentId    String   @unique
  receiptNo    String
  issuedAt     DateTime @default(now())

  school       School   @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  payment      Payment  @relation(fields: [paymentId], references: [id])

  @@unique([schoolId, receiptNo])
  @@index([schoolId])
}
```

`Payment` creation, `StudentFee.status` update, and `Receipt` creation
happen inside one database transaction (per `docs/architecture.md` §7)
— a payment without a receipt is not a valid end state.

## 8. Communication & Documents

```prisma
model Notice {
  id           String   @id @default(cuid())
  schoolId     String
  title        String
  body         String
  audienceType NoticeAudience  // ALL_SCHOOL, CLASS, SECTION, INDIVIDUAL
  audienceRefId String?         // classId / sectionId / userId depending on audienceType
  publishedById String
  publishedAt  DateTime?
  createdAt    DateTime @default(now())
  deletedAt    DateTime?

  school       School   @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  notifications Notification[]
  reads        NoticeRead[]

  @@index([schoolId])
}

// One row per (user, notice) — used for triggered/individual notifications
// with naturally small audiences (fee paid, INDIVIDUAL-audience notices).
// NOT used for broad-audience (ALL_SCHOOL/CLASS/SECTION) notices, which
// would fan out to thousands of rows synchronously at publish time — see
// NoticeRead below and docs/security-scalability-review.md (F4).
model Notification {
  id         String   @id @default(cuid())
  schoolId   String
  userId     String
  noticeId   String?
  channel    NotificationChannel  // IN_APP, EMAIL, SMS, WHATSAPP
  title      String
  body       String
  readAt     DateTime?
  createdAt  DateTime @default(now())

  school     School   @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  user       User     @relation(fields: [userId], references: [id])
  notice     Notice?  @relation(fields: [noticeId], references: [id])

  @@index([schoolId, userId])
}

// Lazily-populated read-tracking for broad-audience notices: created only
// when a user first reads the notice, instead of pre-creating one
// Notification row per recipient at publish time.
model NoticeRead {
  id        String   @id @default(cuid())
  schoolId  String
  noticeId  String
  userId    String
  readAt    DateTime @default(now())

  school    School   @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  notice    Notice   @relation(fields: [noticeId], references: [id])

  @@unique([noticeId, userId])
  @@index([schoolId])
}

model Document {
  id           String   @id @default(cuid())
  schoolId     String
  ownerType    String            // "STUDENT", "TEACHER", etc.
  ownerId      String
  fileKey      String            // object storage key, not a public URL
  fileName     String
  mimeType     String
  sizeBytes    Int
  uploadedById String
  createdAt    DateTime @default(now())
  deletedAt    DateTime?

  school       School   @relation(fields: [schoolId], references: [id], onDelete: Restrict)

  @@index([schoolId])
  @@index([ownerType, ownerId])
}
```

## 9. Audit

```prisma
model AuditLog {
  id           String   @id @default(cuid())
  schoolId     String?           // null for platform-level actions
  userId       String?           // actor; null for system-initiated
  action       String            // e.g. "fee.collect", "user.disable"
  module       String
  resourceType String
  resourceId   String
  metadata     Json?             // never secrets/tokens/passwords
  ipAddress    String?
  userAgent    String?
  createdAt    DateTime @default(now())

  school       School?  @relation(fields: [schoolId], references: [id])
  actor        User?    @relation(fields: [userId], references: [id])

  @@index([schoolId, createdAt])
  @@index([resourceType, resourceId])
}
```

`AuditLog` rows are never updated or deleted by application code
(append-only); only a platform-level retention job (Phase 15) may prune
rows older than the documented retention policy.

## 10. Subscriptions & Entitlements (architecture now, minimal use in MVP)

```prisma
model Plan {
  id        String   @id @default(cuid())
  name      String   @unique       // "Starter", "Professional", "Advanced"
  priceMinor Int
  billingCycle String              // "MONTHLY", "ANNUAL"

  features PlanFeature[]
  subscriptions Subscription[]
}

model Feature {
  id     String @id @default(cuid())
  key    String @unique       // "attendance", "whatsapp", "advanced_reports"

  planFeatures PlanFeature[]
}

model PlanFeature {
  id        String @id @default(cuid())
  planId    String
  featureId String

  plan    Plan    @relation(fields: [planId], references: [id])
  feature Feature @relation(fields: [featureId], references: [id])

  @@unique([planId, featureId])
}

model Subscription {
  id         String   @id @default(cuid())
  schoolId   String   @unique
  planId     String
  status     SubscriptionStatus  // TRIALING, ACTIVE, PAST_DUE, CANCELED
  startedAt  DateTime @default(now())
  currentPeriodEnd DateTime?

  school     School   @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  plan       Plan     @relation(fields: [planId], references: [id])
}
```

Feature entitlement checks (`school has feature X`) are resolved
server-side in the same authorization path as permission checks — see
`docs/authorization.md` §6.

## 10a. Soft Delete vs. Unique Constraints (required amendment)

Every `@@unique`/`@unique` constraint on a table that also has
`deletedAt` must be implemented as a **partial unique index** (`WHERE
deletedAt IS NULL`), not a plain unique constraint — otherwise a
soft-deleted row permanently blocks reuse of its unique value (a
disabled user's email can never be reinvited, a withdrawn student's
admission number can never be reissued, a former staff member can never
get a new `SchoolMembership` at the same school if rehired, a deleted
custom role's name can never be reused). Prisma's `@@unique` cannot
express a `WHERE` clause directly, so these are implemented as a raw SQL
migration (`CREATE UNIQUE INDEX ... WHERE "deletedAt" IS NULL`) applied
alongside the generated schema, at Step 6. Applies at minimum to:
`User.email`, `SchoolMembership(userId, schoolId)`, `Role(schoolId,
name)`, `AcademicYear(schoolId, name)`, `Class(academicYearId, name)`,
`Section(classId, name)`, `Subject(schoolId, name)`, `Teacher(schoolId,
userId)`, `Student(schoolId, admissionNo)`, `FeeCategory(schoolId,
name)`.

## 11. Cascade & Deletion Policy

| Relationship | On parent delete |
|---|---|
| School → any school-owned table | `Restrict` (schools are deactivated, never hard-deleted while data exists) |
| AcademicYear → Class | `Restrict` |
| Class → Section | `Restrict` |
| Student → StudentParent/Attendance/StudentFee | `Restrict`; student is soft-deleted (status change), not removed |
| Payment → Receipt | Payment is never deleted; refunds are a new state/record, not a deletion |
| Role → SchoolMembership | `Restrict` (must reassign memberships before deleting a role) |

Hard deletes are reserved for genuinely disposable rows only (e.g. an
expired session/token table, not modeled above since sessions may live
in Redis rather than Postgres).

## 12. Indexing Summary

Every `schoolId` column is indexed (most tables above show this
explicitly). Additional composite indexes called out where a query
pattern is already known: `Attendance(sectionId, date)`,
`Attendance(studentId, date)` (uniqueness + lookup), `AuditLog(schoolId,
createdAt)`, `Notification(schoolId, userId)`. Further indexes are added
based on actual slow-query analysis in Phase 14 (Performance Audit), per
`docs/architecture.md` §16 — not spec-guessed now.

## 13. Deferred to Later Phases (not modeled here)

Exam/Result, Homework, Leave, Library, Inventory, Transport, Event,
Complaint entities are Phase 2/3 modules per `docs/modules.md` — their
schemas are designed when those phases start, following the same
conventions (`schoolId`, soft delete where historical, audit-logged
mutations) established here.
