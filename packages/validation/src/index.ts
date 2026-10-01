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

// A real ISO 3166-1 alpha-2 region ('IN' yes, 'ZZ' no) — Intl is the source of truth.
export function isValidCountryCode(value: string): boolean {
  if (!/^[A-Z]{2}$/.test(value)) return false;
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(value);
    return !!name && name !== value && name !== 'Unknown Region';
  } catch {
    return false;
  }
}
const countryCodeSchema = z.string().refine(isValidCountryCode, 'Choose a valid country');

export const registerSchoolSchema = z.object({
  schoolName: z.string().min(2, 'School name is required'),
  directorFirstName: z.string().min(1, 'First name is required'),
  directorLastName: z.string().min(1, 'Last name is required'),
  email: z.string().email(),
  password: passwordSchema,
  // Where the school is — the web app sends the visitor's detected country.
  country: countryCodeSchema.optional(),
});
export type RegisterSchoolInput = z.infer<typeof registerSchoolSchema>;

// Intl is the source of truth for what counts as a real IANA zone name
// ('Asia/Kolkata' yes, 'Mars/Olympus' no) — in Node and every browser.
export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

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
  // Decides what "today" means for the school: when attendance locks, which
  // holiday is "next". An unknown zone would silently fall back, so reject it here.
  timezone: z.string().refine(isValidTimeZone, 'Choose a valid time zone').optional(),
  country: countryCodeSchema.optional(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code, like INR').optional(),
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

// Email is optional here (not required) because a Parent record's own
// `email` field is used as the default target — only overridden when
// that field is empty or the admin wants to send the invite elsewhere.
export const inviteParentSchema = z.object({
  email: z.string().email('Enter a valid email').optional(),
});
export type InviteParentInput = z.infer<typeof inviteParentSchema>;

// --- Attendance (docs/modules.md Phase 8) -----------------------------------

const attendanceStatusSchema = z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']);

export const markAttendanceSchema = z.object({
  sectionId: z.string().min(1, 'Section is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
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

// --- Communication (docs/modules.md Phase 10) -------------------------------

export const noticeAudienceSchema = z.enum(['ALL_SCHOOL', 'CLASS', 'SECTION', 'INDIVIDUAL']);

export const createNoticeSchema = z
  .object({
    title: z.string().min(1, 'Title is required'),
    body: z.string().min(1, 'Body is required'),
    audienceType: noticeAudienceSchema,
    audienceRefId: z.string().optional(),
  })
  .refine((data) => data.audienceType === 'ALL_SCHOOL' || !!data.audienceRefId, {
    message: 'A target is required for this audience.',
    path: ['audienceRefId'],
  });
export type CreateNoticeInput = z.infer<typeof createNoticeSchema>;

// --- UI form schemas ------------------------------------------------------
// Deliberately STRICTER than the API schemas above. The forms give users
// immediate, specific feedback (which rule failed and how to fix it),
// while the API keeps its own baseline validation as the security
// boundary — client-side rules are UX, never a substitute for it. Keeping
// the two separate also means tightening a form rule never breaks
// existing accounts, scripts, or integrations that talk to the API.

const EMAIL_PATTERN =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

export const emailField = z
  .string({ required_error: 'Email is required' })
  .trim()
  .min(1, 'Email is required')
  .max(254, 'Email is too long (maximum 254 characters)')
  .refine((v) => !/\s/.test(v), 'Email cannot contain spaces')
  .refine((v) => !v.includes('..'), 'Email cannot contain two dots in a row')
  .refine((v) => EMAIL_PATTERN.test(v), 'Enter a valid email address, like name@school.com')
  .transform((v) => v.toLowerCase());

const PERSON_NAME_PATTERN = /^\p{L}[\p{L}\p{M} .'’-]*$/u;

function personNameField(label: string) {
  return z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .min(2, `${label} must be at least 2 characters`)
    .max(50, `${label} must be 50 characters or fewer`)
    .refine(
      (v) => PERSON_NAME_PATTERN.test(v),
      `${label} can only contain letters, spaces, apostrophes, hyphens and full stops`,
    );
}

const COMMON_PASSWORD_FRAGMENTS = ['password', 'passw0rd', 'qwerty', 'letmein', '123456', 'abc123', 'welcome', 'schovexa', 'admin123'];

export const strongPasswordSchema = z
  .string({ required_error: 'Password is required' })
  .min(1, 'Password is required')
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be 128 characters or fewer')
  .refine((p) => !/\s/.test(p), 'Password cannot contain spaces')
  .refine((p) => /[A-Z]/.test(p), 'Add at least one uppercase letter (A–Z)')
  .refine((p) => /[a-z]/.test(p), 'Add at least one lowercase letter (a–z)')
  .refine((p) => /\d/.test(p), 'Add at least one number (0–9)')
  .refine((p) => /[^A-Za-z0-9\s]/.test(p), 'Add at least one symbol, like ! @ # $ %')
  .refine((p) => !/(.)\1{3,}/.test(p), 'Avoid repeating the same character four or more times in a row')
  .refine(
    (p) => !COMMON_PASSWORD_FRAGMENTS.some((w) => p.toLowerCase().includes(w)),
    'This password is too easy to guess — avoid common words and sequences like "password" or "123456"',
  );

const confirmPasswordField = z.string({ required_error: 'Please confirm your password' }).min(1, 'Please confirm your password');

export const loginFormSchema = z.object({
  email: emailField,
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
});
export type LoginFormInput = z.input<typeof loginFormSchema>;
export type LoginFormOutput = z.output<typeof loginFormSchema>;

export const forgotPasswordFormSchema = z.object({ email: emailField });
export type ForgotPasswordFormInput = z.input<typeof forgotPasswordFormSchema>;

export const setPasswordFormSchema = z
  .object({ password: strongPasswordSchema, confirmPassword: confirmPasswordField })
  .superRefine((data, ctx) => {
    if (data.confirmPassword && data.password !== data.confirmPassword) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmPassword'], message: 'Passwords do not match' });
    }
  });
export type SetPasswordFormInput = z.input<typeof setPasswordFormSchema>;

export const registerSchoolFormSchema = z
  .object({
    schoolName: z
      .string({ required_error: 'School name is required' })
      .trim()
      .min(1, 'School name is required')
      .min(3, 'School name must be at least 3 characters')
      .max(100, 'School name must be 100 characters or fewer')
      .refine((v) => /\p{L}/u.test(v), 'School name must include letters')
      .refine(
        (v) => /^[\p{L}\p{N} .,&'’()/-]+$/u.test(v),
        "School name can only contain letters, numbers, spaces and . , & ' ( ) - /",
      ),
    directorFirstName: personNameField('First name'),
    directorLastName: personNameField('Last name'),
    email: emailField,
    password: strongPasswordSchema,
    confirmPassword: confirmPasswordField,
    acceptTerms: z
      .boolean()
      .refine((v) => v === true, 'Please accept the Terms of Service and Privacy Policy to continue'),
  })
  .superRefine((data, ctx) => {
    if (data.confirmPassword && data.password !== data.confirmPassword) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmPassword'], message: 'Passwords do not match' });
    }
    const emailName = data.email.split('@')[0]?.toLowerCase() ?? '';
    const lowered = data.password.toLowerCase();
    if (emailName.length >= 4 && lowered.includes(emailName)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: 'Password must not contain the first part of your email' });
    }
    for (const name of [data.directorFirstName, data.directorLastName]) {
      const n = name.trim().toLowerCase();
      if (n.length >= 3 && lowered.includes(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: 'Password must not contain your name' });
        break;
      }
    }
  });
export type RegisterSchoolFormInput = z.input<typeof registerSchoolFormSchema>;
export type RegisterSchoolFormOutput = z.output<typeof registerSchoolFormSchema>;

// --- Holidays ---------------------------------------------------------------

export const HOLIDAY_TYPES = ['NATIONAL', 'FESTIVAL', 'VACATION', 'SCHOOL', 'OTHER'] as const;
const holidayTypeSchema = z.enum(HOLIDAY_TYPES);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');

const holidayBase = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Give the holiday a name (at least 2 characters)')
    .max(100, 'Keep the name under 100 characters'),
  type: holidayTypeSchema.default('OTHER'),
  startDate: isoDateSchema,
  // Same as startDate for a one-day holiday.
  endDate: isoDateSchema,
  description: z.string().trim().max(500, 'Keep the note under 500 characters').optional().or(z.literal('')),
});

const endNotBeforeStart = (v: { startDate?: string; endDate?: string }) => !v.startDate || !v.endDate || v.endDate >= v.startDate;

export const createHolidaySchema = holidayBase.refine(endNotBeforeStart, {
  path: ['endDate'],
  message: 'The end date can’t be before the start date',
});
export type CreateHolidayInput = z.input<typeof createHolidaySchema>;

export const updateHolidaySchema = holidayBase.partial().refine(endNotBeforeStart, {
  path: ['endDate'],
  message: 'The end date can’t be before the start date',
});
export type UpdateHolidayInput = z.input<typeof updateHolidaySchema>;

// --- Public "Contact us" form (marketing site) ---

export const CONTACT_TOPICS = ['DEMO', 'PRICING', 'SUPPORT', 'PARTNERSHIP', 'OTHER'] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

const optionalText = (max: number, message: string) =>
  z.string().trim().max(max, message).optional().or(z.literal(''));

export const contactMessageSchema = z.object({
  name: z.string().trim().min(2, 'Please tell us your name').max(100, 'Keep your name under 100 characters'),
  email: z.string().trim().email('Enter a valid email address').max(200),
  phone: z
    .string()
    .trim()
    .max(20, 'Keep the phone number under 20 characters')
    .regex(/^[+()\-\s\d]*$/, 'Use digits, spaces, + ( ) or - only')
    .optional()
    .or(z.literal('')),
  organization: optionalText(150, 'Keep the school name under 150 characters'),
  topic: z.enum(CONTACT_TOPICS).default('OTHER'),
  message: z
    .string()
    .trim()
    .min(10, 'Tell us a little more (at least 10 characters)')
    .max(2000, 'Keep the message under 2000 characters'),
  // Honeypot: real people never see or fill this. A bot that does is
  // answered with a normal-looking success and nothing is stored.
  website: z.string().max(200).optional().or(z.literal('')),
});
export type ContactMessageInput = z.input<typeof contactMessageSchema>;
export type ContactMessageOutput = z.output<typeof contactMessageSchema>;

// --- "My profile": what a signed-in person can edit about themselves ---

export const PROFILE_GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;

const phoneField = (label: string) =>
  z
    .string()
    .trim()
    .max(20, `Keep the ${label} under 20 characters`)
    .regex(/^[+()\-\s\d]*$/, 'Use digits, spaces, + ( ) or - only')
    .optional()
    .or(z.literal(''));

const todayIso = () => new Date().toISOString().slice(0, 10);

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(60, 'Keep it under 60 characters'),
  lastName: z.string().trim().min(1, 'Last name is required').max(60, 'Keep it under 60 characters'),
  phone: phoneField('phone number'),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')
    .refine((v) => v <= todayIso(), 'Date of birth can’t be in the future')
    .optional()
    .or(z.literal('')),
  gender: z.enum(PROFILE_GENDERS).optional().or(z.literal('')),
  address: z.string().trim().max(300, 'Keep the address under 300 characters').optional().or(z.literal('')),
  emergencyContactName: z.string().trim().max(100, 'Keep the name under 100 characters').optional().or(z.literal('')),
  emergencyContactPhone: phoneField('phone number'),
  bio: z.string().trim().max(500, 'Keep it under 500 characters').optional().or(z.literal('')),
});
export type UpdateProfileInput = z.input<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'Choose a password you haven’t used just now',
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
