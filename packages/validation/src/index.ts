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
