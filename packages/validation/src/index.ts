// Shared Zod schemas between apps/api (request validation) and apps/web
// (React Hook Form resolvers) — one source of truth per docs/architecture.md
// "Validate at multiple layers" principle (frontend + API share this schema;
// business rules and DB constraints are additional, separate layers).
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters');

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const selectSchoolSchema = z.object({
  membershipId: z.string().min(1),
});
export type SelectSchoolInput = z.infer<typeof selectSchoolSchema>;

// --- School Management (docs/modules.md Phase 5) --------------------------

export const registerSchoolSchema = z.object({
  schoolName: z.string().min(2, 'School name is required'),
  directorFirstName: z.string().min(1, 'First name is required'),
  directorLastName: z.string().min(1, 'Last name is required'),
  email: z.string().email(),
  password: passwordSchema,
});
export type RegisterSchoolInput = z.infer<typeof registerSchoolSchema>;

export const updateSchoolSchema = z.object({
  name: z.string().min(2).optional(),
  address: z.string().optional(),
  // z.string().email().optional() only accepts undefined, not '' — an
  // untouched optional field a form initializes as '' would then fail
  // "invalid email" even though the user never typed anything. Allowing
  // '' explicitly (as "clear this field") fixes that for both this form
  // and the API, which validates the same shared schema.
  contactEmail: z.union([z.literal(''), z.string().email()]).optional(),
  contactPhone: z.string().optional(),
  website: z.union([z.literal(''), z.string().url()]).optional(),
  timezone: z.string().optional(),
  currency: z.string().optional(),
  dateFormat: z.string().optional(),
});
export type UpdateSchoolInput = z.infer<typeof updateSchoolSchema>;

const permissionScopeSchema = z.enum([
  'ALL_SCHOOL',
  'OWN_CLASS',
  'OWN_SUBJECT',
  'OWN_STUDENTS',
  'OWN_CHILDREN',
  'SELF',
]);

export const rolePermissionInputSchema = z.object({
  permissionKey: z.string().min(1),
  scope: permissionScopeSchema,
  readOnly: z.boolean().optional().default(false),
});

export const createRoleSchema = z.object({
  name: z.string().min(2, 'Role name is required'),
  permissions: z.array(rolePermissionInputSchema).default([]),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  name: z.string().min(2).optional(),
  permissions: z.array(rolePermissionInputSchema).optional(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const createInvitationSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  roleId: z.string().min(1),
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const updateMembershipSchema = z.object({
  roleId: z.string().min(1).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DISABLED']).optional(),
});
export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;

export const createAcademicYearSchema = z.object({
  name: z.string().min(2, 'Academic year name is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
});
export type CreateAcademicYearInput = z.infer<typeof createAcademicYearSchema>;

// --- Academic Management (docs/modules.md Phase 6) -------------------------

export const createClassSchema = z.object({
  academicYearId: z.string().min(1, 'Academic year is required'),
  name: z.string().min(1, 'Class name is required'),
  order: z.coerce.number().int(),
});
export type CreateClassInput = z.infer<typeof createClassSchema>;

export const updateClassSchema = z.object({
  name: z.string().min(1).optional(),
  order: z.coerce.number().int().optional(),
});
export type UpdateClassInput = z.infer<typeof updateClassSchema>;

export const createSectionSchema = z.object({
  name: z.string().min(1, 'Section name is required'),
  // '' means "no class teacher yet" — a select left on its placeholder
  // option, same empty-string-as-unset pattern as updateSchoolSchema above.
  classTeacherId: z.union([z.literal(''), z.string()]).optional(),
});
export type CreateSectionInput = z.infer<typeof createSectionSchema>;

export const updateSectionSchema = z.object({
  name: z.string().min(1).optional(),
  classTeacherId: z.union([z.literal(''), z.string()]).optional(),
});
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;

export const createSubjectSchema = z.object({
  name: z.string().min(1, 'Subject name is required'),
  code: z.string().optional(),
});
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;

export const updateSubjectSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().optional(),
});
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;

export const createTeacherSchema = z.object({
  userId: z.string().min(1, 'A staff member is required'),
  employeeCode: z.string().optional(),
  joiningDate: z.union([z.literal(''), z.string()]).optional(),
});
export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;

export const updateTeacherSchema = z.object({
  employeeCode: z.string().optional(),
  joiningDate: z.union([z.literal(''), z.string()]).optional(),
});
export type UpdateTeacherInput = z.infer<typeof updateTeacherSchema>;

export const createTeacherAssignmentSchema = z.object({
  sectionId: z.string().min(1, 'Section is required'),
  subjectId: z.string().min(1, 'Subject is required'),
});
export type CreateTeacherAssignmentInput = z.infer<typeof createTeacherAssignmentSchema>;

// --- Student Management (docs/modules.md Phase 7) ---------------------------

const studentStatusSchema = z.enum(['ENROLLED', 'TRANSFERRED', 'GRADUATED', 'WITHDRAWN']);

export const createStudentSchema = z.object({
  admissionNo: z.string().min(1, 'Admission number is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: z.union([z.literal(''), z.string()]).optional(),
  gender: z.string().optional(),
  sectionId: z.union([z.literal(''), z.string()]).optional(),
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  dateOfBirth: z.union([z.literal(''), z.string()]).optional(),
  gender: z.string().optional(),
  sectionId: z.union([z.literal(''), z.string()]).optional(),
  status: studentStatusSchema.optional(),
});
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const createParentSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phone: z.string().optional(),
  email: z.union([z.literal(''), z.string().email()]).optional(),
});
export type CreateParentInput = z.infer<typeof createParentSchema>;

export const linkParentSchema = z.object({
  parentId: z.string().min(1, 'Parent is required'),
  relation: z.string().min(1, 'Relation is required'),
  isPrimary: z.boolean().optional().default(false),
});
export type LinkParentInput = z.infer<typeof linkParentSchema>;

// --- Attendance (docs/modules.md Phase 8) -----------------------------------

const attendanceStatusSchema = z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']);

export const markAttendanceSchema = z.object({
  sectionId: z.string().min(1, 'Section is required'),
  date: z.string().min(1, 'Date is required'),
  records: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: attendanceStatusSchema,
        remarks: z.string().optional(),
      }),
    )
    .min(1, 'At least one attendance record is required'),
});
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;

export const updateAttendanceSchema = z.object({
  status: attendanceStatusSchema.optional(),
  remarks: z.string().optional(),
});
export type UpdateAttendanceInput = z.infer<typeof updateAttendanceSchema>;

// --- Fees (docs/modules.md Phase 9) -----------------------------------------
// Amounts are always minor units (paise/cents) on the wire, matching the
// DB columns (FeeStructure.amountMinor, StudentFee.amountDueMinor,
// Payment.amountMinor) — converting to/from a major-unit display value
// (e.g. rupees) is a UI formatting concern, not a validation concern.

const feeFrequencySchema = z.enum(['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'ANNUAL']);
const paymentMethodSchema = z.enum(['CASH', 'CHEQUE', 'BANK_TRANSFER', 'ONLINE']);

export const createFeeCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
});
export type CreateFeeCategoryInput = z.infer<typeof createFeeCategorySchema>;

export const createFeeStructureSchema = z.object({
  feeCategoryId: z.string().min(1, 'Fee category is required'),
  academicYearId: z.string().min(1, 'Academic year is required'),
  classId: z.union([z.literal(''), z.string()]).optional(),
  amountMinor: z.coerce.number().int().positive('Amount must be greater than zero'),
  frequency: feeFrequencySchema,
});
export type CreateFeeStructureInput = z.infer<typeof createFeeStructureSchema>;

export const assignFeeToStudentSchema = z.object({
  feeStructureId: z.string().min(1, 'Fee structure is required'),
  amountDueMinor: z.coerce.number().int().positive().optional(),
  dueDate: z.union([z.literal(''), z.string()]).optional(),
});
export type AssignFeeToStudentInput = z.infer<typeof assignFeeToStudentSchema>;

export const updateStudentFeeSchema = z.object({
  amountDueMinor: z.coerce.number().int().positive().optional(),
  dueDate: z.union([z.literal(''), z.string()]).optional(),
});
export type UpdateStudentFeeInput = z.infer<typeof updateStudentFeeSchema>;

export const recordPaymentSchema = z.object({
  amountMinor: z.coerce.number().int().positive('Amount must be greater than zero'),
  method: paymentMethodSchema,
  paidAt: z.union([z.literal(''), z.string()]).optional(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
