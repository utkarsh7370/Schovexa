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
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  website: z.string().url().optional(),
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
