// Shared Zod schemas between apps/api (request validation) and apps/web
// (React Hook Form resolvers) — one source of truth per docs/architecture.md
// "Validate at multiple layers" principle (frontend + API share this schema;
// business rules and DB constraints are additional, separate layers).
import { z } from 'zod';

// Emails are compared case-insensitively everywhere, so the API normalises
// them once, on the way in — "Director@School.com" and "director@school.com"
// are the same person, never two accounts.
export const apiEmail = z.string().trim().toLowerCase().email().max(254);

export const loginSchema = z.object({
  email: apiEmail,
  password: z.string().min(1, 'Password is required').max(256),
  // "Keep me signed in": a longer session on this device.
  rememberMe: z.boolean().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

// Passwords people actually choose, 10+ characters long (shorter ones are
// already refused by the length rule). Compared after lowercasing and
// dropping everything but letters and digits, so "Password-123!" and
// "password123" are the same entry.
const COMMON_PASSWORDS = new Set([
  'password123', 'password1234', 'password12345', 'passw0rd123', 'password123456', 'p4ssw0rd123',
  '1234567890', '12345678910', '123456789012', '0123456789', '1234512345', '9876543210', '0987654321',
  'qwertyuiop', 'qwerty12345', 'qwerty123456', 'qwertyuiop123', 'asdfghjkl1', 'asdfghjklqwerty', 'zxcvbnm123', '1q2w3e4r5t', '1qaz2wsx3edc', 'qazwsxedc123',
  'abcdefghij', 'abcd123456', 'abc1234567', 'abcdefg123',
  'iloveyou123', 'iloveyou12', 'iloveyou1234', 'iloveyou2', 'welcome123', 'welcome1234', 'welcome12345', 'letmein123', 'letmein1234', 'trustno1234',
  'administrator', 'admin12345', 'admin123456', 'admin1234567', 'administrator1', 'changeme123', 'changeme1234', 'default1234',
  'school12345', 'school123456', 'schoolschool', 'schovexa123', 'schovexa1234', 'schovexapassword', 'teacher12345', 'student12345', 'principal123',
  'football123', 'baseball123', 'basketball1', 'superman123', 'batman12345', 'monkey12345', 'dragon12345', 'sunshine123', 'princess123', 'michael1234', 'jordan12345',
  'internet123', 'computer123', 'mypassword1', 'mypassword12', 'mypassword123', 'newpassword1', 'newpassword12', 'newpassword123', 'testtest123', 'test1234567',
]);

const normalizePassword = (p: string) => p.toLowerCase().replace(/[^a-z0-9]/g, '');

// A run of the same character, or of consecutive characters, is not a password.
function isTrivialSequence(p: string): boolean {
  const n = normalizePassword(p);
  if (n.length < 6) return false;
  if (/^(.)\1+$/.test(n)) return true;
  const code = (i: number) => n.charCodeAt(i);
  let up = true;
  let down = true;
  for (let i = 1; i < n.length; i += 1) {
    if (code(i) !== code(i - 1) + 1) up = false;
    if (code(i) !== code(i - 1) - 1) down = false;
  }
  return up || down;
}

export function isCommonPassword(p: string): boolean {
  return COMMON_PASSWORDS.has(normalizePassword(p)) || isTrivialSequence(p);
}

// What the API enforces on every password it ever stores (sign-up, invite,
// reset, change) — the web forms add stricter rules for instant feedback,
// but this is the real gate. Length, not composition rules: a long passphrase
// beats "P@ssw0rd1!", so the bar is ten characters, not on a blocklist, and
// not a trivial run like 1234567890.
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be 128 characters or fewer')
  .refine((p) => p.trim().length > 0, 'Password cannot be only spaces')
  .refine((p) => !isCommonPassword(p), 'That password is too easy to guess — choose something less common');

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const forgotPasswordSchema = z.object({
  email: apiEmail,
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
  email: apiEmail,
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

const timeOfDay = (label: string) => z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, `Enter the ${label} as a time, like 09:00`);

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
  // Staff working hours — see School.staffPunchInTime.
  staffPunchInTime: timeOfDay('punch-in time').optional(),
  staffPunchOutTime: timeOfDay('punch-out time').optional(),
  staffLateGraceMinutes: z.coerce.number().int().min(0, 'Use 0 or more minutes').max(120, 'Keep the grace period under 2 hours').optional(),
  // Message a student's parents when the student is marked absent.
  notifyParentsOnAbsence: z.boolean().optional(),
  // Profile
  motto: z.string().trim().max(120, 'Keep the motto under 120 characters').optional(),
  description: z.string().trim().max(600, 'Keep the description under 600 characters').optional(),
  schoolCode: z.string().trim().max(30, 'Keep the school code under 30 characters').optional(),
  board: z.string().trim().max(60).optional(),
  schoolType: z.string().trim().max(60).optional(),
  establishedYear: z.number().int().min(1800, 'Enter a year from 1800').max(new Date().getFullYear(), 'That year is in the future').nullable().optional(),
  affiliationNo: z.string().trim().max(40).optional(),
  // Contact + address
  alternatePhone: z.string().trim().max(30).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().max(20).optional(),
}).refine((v) => !v.staffPunchInTime || !v.staffPunchOutTime || v.staffPunchOutTime > v.staffPunchInTime, {
  path: ['staffPunchOutTime'],
  message: 'Punch-out must be later than punch-in',
});
export type UpdateSchoolInput = z.input<typeof updateSchoolSchema>;

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
  email: apiEmail,
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

const academicYearDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');
const endAfterStart = (v: { startDate?: string; endDate?: string }) => !v.startDate || !v.endDate || v.endDate > v.startDate;

const academicYearFields = {
  name: z.string().trim().min(2, 'Academic year name is required').max(30, 'Keep the name under 30 characters'),
  startDate: academicYearDate,
  endDate: academicYearDate,
};

export const createAcademicYearSchema = z.object(academicYearFields).refine(endAfterStart, {
  path: ['endDate'],
  message: 'The end date must be after the start date',
});
export type CreateAcademicYearInput = z.infer<typeof createAcademicYearSchema>;

// Editing a proposed year (before it is approved) — any subset of the fields.
export const updateAcademicYearSchema = z.object(academicYearFields).partial().refine(endAfterStart, {
  path: ['endDate'],
  message: 'The end date must be after the start date',
});
export type UpdateAcademicYearInput = z.infer<typeof updateAcademicYearSchema>;

// The Director's decision on a proposed year. An approval may carry an
// optional comment; rejecting or asking for changes must say why.
export const approveAcademicYearSchema = z.object({
  note: z.string().trim().max(500, 'Keep the note under 500 characters').optional().or(z.literal('')),
});
export type ApproveAcademicYearInput = z.infer<typeof approveAcademicYearSchema>;

export const reviewAcademicYearSchema = z.object({
  note: z.string().trim().min(3, 'Tell the Principal why (at least 3 characters)').max(500, 'Keep the note under 500 characters'),
});
export type ReviewAcademicYearInput = z.infer<typeof reviewAcademicYearSchema>;

export const resubmitAcademicYearSchema = approveAcademicYearSchema;
export type ResubmitAcademicYearInput = ApproveAcademicYearInput;

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
  departmentId: z.union([z.literal(''), z.string()]).optional(),
});
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;

export const updateSubjectSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().optional(),
  departmentId: z.union([z.literal(''), z.string()]).optional(),
});
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;

export const createTeacherSchema = z.object({
  userId: z.string().min(1, 'A staff member is required'),
  employeeCode: z.string().optional(),
  joiningDate: z.union([z.literal(''), z.string()]).optional(),
  departmentId: z.union([z.literal(''), z.string()]).optional(),
});
export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;

export const updateTeacherSchema = z.object({
  employeeCode: z.string().optional(),
  joiningDate: z.union([z.literal(''), z.string()]).optional(),
  departmentId: z.union([z.literal(''), z.string()]).optional(),
});
export type UpdateTeacherInput = z.infer<typeof updateTeacherSchema>;

export const createTeacherAssignmentSchema = z.object({
  sectionId: z.string().min(1, 'Section is required'),
  subjectId: z.string().min(1, 'Subject is required'),
});
export type CreateTeacherAssignmentInput = z.infer<typeof createTeacherAssignmentSchema>;

// --- Student Management (docs/modules.md Phase 7) ---------------------------

const studentStatusSchema = z.enum(['ENROLLED', 'TRANSFERRED', 'GRADUATED', 'WITHDRAWN']);

// Which part of the school day a student attends (see StudentSchoolDay in the DB).
export const STUDENT_SCHOOL_DAYS = ['FULL_DAY', 'FIRST_HALF', 'SECOND_HALF'] as const;
export type StudentSchoolDay = (typeof STUDENT_SCHOOL_DAYS)[number];
const studentSchoolDaySchema = z.enum(STUDENT_SCHOOL_DAYS);

export const createStudentSchema = z.object({
  admissionNo: z.string().min(1, 'Admission number is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: z.union([z.literal(''), z.string()]).optional(),
  gender: z.string().optional(),
  sectionId: z.union([z.literal(''), z.string()]).optional(),
  schoolDay: studentSchoolDaySchema.optional(),
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  dateOfBirth: z.union([z.literal(''), z.string()]).optional(),
  gender: z.string().optional(),
  sectionId: z.union([z.literal(''), z.string()]).optional(),
  status: studentStatusSchema.optional(),
  schoolDay: studentSchoolDaySchema.optional(),
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
  email: apiEmail.optional(),
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
  // Which methods a school accepts is set on the server (PAYMENT_METHODS); today that is cash only.
  method: paymentMethodSchema.default('CASH'),
  paidAt: z.union([z.literal(''), z.string()]).optional(),
  receivedFrom: z.string().trim().max(100, 'Keep the name under 100 characters').optional(),
  note: z.string().trim().max(300, 'Keep the note under 300 characters').optional(),
  reference: z.string().trim().max(60, 'Keep the reference under 60 characters').optional(),
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
  rememberMe: z.boolean().optional(),
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
  // Which non-essential messages they want. Security emails are always sent.
  notifyByEmail: z.boolean().optional(),
  notifyInApp: z.boolean().optional(),
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

// --- Staff attendance (teachers punch in/out; a Principal or Director approves) ---

const attendanceDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');

export const approveStaffAttendanceSchema = z.object({
  note: z.string().trim().max(300, 'Keep the note under 300 characters').optional().or(z.literal('')),
});
export type ApproveStaffAttendanceInput = z.infer<typeof approveStaffAttendanceSchema>;

export const rejectStaffAttendanceSchema = z.object({
  note: z.string().trim().min(3, 'Say why (at least 3 characters)').max(300, 'Keep the note under 300 characters'),
});
export type RejectStaffAttendanceInput = z.infer<typeof rejectStaffAttendanceSchema>;

export const approveAllStaffAttendanceSchema = z.object({ date: attendanceDate });
export type ApproveAllStaffAttendanceInput = z.infer<typeof approveAllStaffAttendanceSchema>;

// --- Account security ---------------------------------------------------

export const verifyEmailSchema = z.object({ token: z.string().min(1, 'This link is missing its token') });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

// Re-entering the password to prove it's still you before a sensitive action.
export const reauthSchema = z.object({ password: z.string().min(1, 'Enter your password').max(256) });
export type ReauthInput = z.infer<typeof reauthSchema>;

// --- School configuration (timings, working days, attendance, fees, notifications, documents) ---

export const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

const distinctInts = (min: number, max: number, label: string) =>
  z
    .array(z.number().int().min(min, `${label} must be ${min}–${max}`).max(max, `${label} must be ${min}–${max}`))
    .refine((v) => new Set(v).size === v.length, `Each ${label.toLowerCase()} can be listed once`);

const nameList = (label: string, max: number) =>
  z
    .array(z.string().trim().min(1, `${label} can’t be blank`).max(40, `Keep each ${label.toLowerCase()} under 40 characters`))
    .max(max, `At most ${max} ${label.toLowerCase()}s`)
    .refine((v) => new Set(v.map((x) => x.toLowerCase())).size === v.length, `Each ${label.toLowerCase()} can be listed once`);

export const updateSchoolSettingsSchema = z
  .object({
    schoolStartTime: timeOfDay('start time').optional(),
    schoolEndTime: timeOfDay('end time').optional(),
    breakStartTime: timeOfDay('break start').nullable().optional(),
    breakEndTime: timeOfDay('break end').nullable().optional(),
    workingDays: distinctInts(1, 7, 'Working day').refine((v) => v.length >= 1, 'Choose at least one working day').optional(),
    offSaturdays: distinctInts(1, 5, 'Saturday').optional(),
    attendanceEditWindowDays: z.number().int().min(0, 'Use 0 or more days').max(30, 'At most 30 days').optional(),
    attendanceMinPercent: z.number().int().min(0).max(100, 'Use a percentage from 0 to 100').optional(),
    attendanceOnNonWorkingDays: z.boolean().optional(),
    receiptPrefix: z.string().trim().regex(/^[A-Za-z0-9/_-]{0,12}$/, 'Up to 12 letters, numbers, - _ or /').optional(),
    allowPartialPayments: z.boolean().optional(),
    lateFeePerDayMinor: z.number().int().min(0).max(10_000_000).optional(),
    lateFeeGraceDays: z.number().int().min(0, 'Use 0 or more days').max(365).optional(),
    passPercent: z.number().int().min(1, 'Use 1–100').max(100, 'Use 1–100').optional(),
    maxDiscountPercent: z.number().int().min(0, 'Use 0–100').max(100, 'Use 0–100').optional(),
    paymentCorrectionWindowDays: z.number().int().min(0, 'Use 0 or more days').max(365, 'At most 365 days').optional(),
    notifyPaymentReceipt: z.boolean().optional(),
    notifyAbsenceEmail: z.boolean().optional(),
    notifyYearApprovalEmail: z.boolean().optional(),
    notifyStaffAttendanceDecisions: z.boolean().optional(),
    documentMaxSizeMb: z.number().int().min(1, 'At least 1 MB').max(25, 'At most 25 MB').optional(),
    allowedDocumentTypes: z.array(z.enum(DOCUMENT_MIME_TYPES)).min(1, 'Allow at least one file type').optional(),
    documentCategories: nameList('Category', 30).optional(),
    requiredStudentDocuments: nameList('Category', 30).optional(),
  })
  .refine((v) => !v.schoolStartTime || !v.schoolEndTime || v.schoolEndTime > v.schoolStartTime, {
    path: ['schoolEndTime'],
    message: 'The school day must end after it starts',
  })
  .refine((v) => v.breakStartTime === undefined || v.breakEndTime === undefined || (v.breakStartTime === null) === (v.breakEndTime === null), {
    path: ['breakEndTime'],
    message: 'Set both break times, or neither',
  })
  .refine((v) => !v.breakStartTime || !v.breakEndTime || v.breakEndTime > v.breakStartTime, {
    path: ['breakEndTime'],
    message: 'The break must end after it starts',
  });
export type UpdateSchoolSettingsInput = z.input<typeof updateSchoolSettingsSchema>;

// --- Academic terms ---

const termBase = z.object({
  name: z.string().trim().min(1, 'Give the term a name').max(60, 'Keep the name under 60 characters'),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
});
export const createTermSchema = termBase.refine(endNotBeforeStart, { path: ['endDate'], message: 'The end date can’t be before the start date' });
export type CreateTermInput = z.input<typeof createTermSchema>;
export const updateTermSchema = termBase.partial().refine(endNotBeforeStart, { path: ['endDate'], message: 'The end date can’t be before the start date' });
export type UpdateTermInput = z.input<typeof updateTermSchema>;

// --- Departments ---

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, 'Give the department a name (at least 2 characters)').max(80, 'Keep the name under 80 characters'),
  code: z.string().trim().max(20, 'Keep the code under 20 characters').optional(),
  description: z.string().trim().max(300, 'Keep the description under 300 characters').optional(),
  headTeacherId: z.union([z.literal(''), z.string()]).optional(),
});
export type CreateDepartmentInput = z.input<typeof createDepartmentSchema>;
export const updateDepartmentSchema = createDepartmentSchema.partial();
export type UpdateDepartmentInput = z.input<typeof updateDepartmentSchema>;

// --- Houses and groups ---

export const GROUP_KINDS = ['HOUSE', 'CLUB', 'SPORTS', 'OTHER'] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

export const createGroupSchema = z.object({
  name: z.string().trim().min(2, 'Give the group a name (at least 2 characters)').max(60, 'Keep the name under 60 characters'),
  kind: z.enum(GROUP_KINDS).default('HOUSE'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour').default('#2563eb'),
  motto: z.string().trim().max(120).optional(),
  description: z.string().trim().max(300).optional(),
  leaderTeacherId: z.union([z.literal(''), z.string()]).optional(),
});
export type CreateGroupInput = z.input<typeof createGroupSchema>;
export const updateGroupSchema = createGroupSchema.partial();
export type UpdateGroupInput = z.input<typeof updateGroupSchema>;

export const addGroupMembersSchema = z.object({
  studentIds: z.array(z.string().min(1)).min(1, 'Choose at least one student').max(200, 'Add up to 200 students at a time'),
});
export type AddGroupMembersInput = z.infer<typeof addGroupMembersSchema>;

// --- Grading ---

export const gradeBandSchema = z.object({
  label: z.string().trim().min(1, 'Give the grade a label').max(20, 'Keep the label under 20 characters'),
  minPercent: z.number().int().min(0, 'Use 0–100').max(100, 'Use 0–100'),
  gradePoint: z.number().min(0).max(10).nullable().optional(),
  remark: z.string().trim().max(40).optional().or(z.literal('')),
});
export const replaceGradingSchema = z
  .object({
    passPercent: z.number().int().min(1, 'Use 1–100').max(100, 'Use 1–100'),
    bands: z.array(gradeBandSchema).min(2, 'Add at least two grades').max(15, 'At most 15 grades'),
  })
  .superRefine((v, ctx) => {
    if (!v.bands.some((b) => b.minPercent === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bands'], message: 'The lowest grade must start at 0%, so every mark earns a grade' });
    }
    if (new Set(v.bands.map((b) => b.minPercent)).size !== v.bands.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bands'], message: 'Two grades can’t start at the same percentage' });
    }
    if (new Set(v.bands.map((b) => b.label.toLowerCase())).size !== v.bands.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bands'], message: 'Each grade label can be used once' });
    }
  });
export type ReplaceGradingInput = z.input<typeof replaceGradingSchema>;

/** The grade a percentage earns on a scale (bands in any order), or null for a bad percentage. */
export function gradeForPercent<B extends { minPercent: number }>(bands: B[], percent: number): B | null {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent);
  return sorted.find((b) => percent >= b.minPercent) ?? null;
}

export const DEFAULT_GRADE_BANDS = [
  { label: 'A+', minPercent: 90, gradePoint: 10, remark: 'Outstanding' },
  { label: 'A', minPercent: 80, gradePoint: 9, remark: 'Excellent' },
  { label: 'B+', minPercent: 70, gradePoint: 8, remark: 'Very good' },
  { label: 'B', minPercent: 60, gradePoint: 7, remark: 'Good' },
  { label: 'C', minPercent: 50, gradePoint: 6, remark: 'Satisfactory' },
  { label: 'D', minPercent: 40, gradePoint: 5, remark: 'Pass' },
  { label: 'F', minPercent: 0, gradePoint: 0, remark: 'Needs improvement' },
] as const;

// --- Accountant: payments, refunds, concessions, reminders -------------------

const isoDateTime = z.union([z.literal(''), z.string()]).optional();

/** Correcting a recorded payment — a reason is always required, and the old values are kept in the audit log. */
export const correctPaymentSchema = z
  .object({
    amountMinor: z.coerce.number().int().positive('Amount must be greater than zero').optional(),
    paidAt: isoDateTime,
    receivedFrom: z.string().trim().max(100).optional(),
    note: z.string().trim().max(300).optional(),
    reference: z.string().trim().max(60).optional(),
    reason: z.string().trim().min(5, 'Say why the payment is being corrected (at least 5 characters)').max(300, 'Keep the reason under 300 characters'),
  })
  .refine((v) => v.amountMinor !== undefined || v.paidAt !== undefined || v.receivedFrom !== undefined || v.note !== undefined || v.reference !== undefined, {
    message: 'Change at least one thing about the payment.',
    path: ['amountMinor'],
  });
export type CorrectPaymentInput = z.infer<typeof correctPaymentSchema>;

export const createRefundSchema = z.object({
  paymentId: z.string().min(1, 'Choose the payment to refund'),
  amountMinor: z.coerce.number().int().positive('Amount must be greater than zero'),
  reason: z.string().trim().min(5, 'Say why the refund is needed (at least 5 characters)').max(300, 'Keep the reason under 300 characters'),
});
export type CreateRefundInput = z.infer<typeof createRefundSchema>;

export const decideRefundSchema = z.object({
  note: z.string().trim().max(300, 'Keep the note under 300 characters').optional(),
});
export type DecideRefundInput = z.infer<typeof decideRefundSchema>;

export const rejectRefundSchema = z.object({
  note: z.string().trim().min(3, 'Say why it is being rejected').max(300, 'Keep the note under 300 characters'),
});
export type RejectRefundInput = z.infer<typeof rejectRefundSchema>;

export const CONCESSION_KINDS = ['DISCOUNT', 'SCHOLARSHIP', 'CONCESSION'] as const;
export type ConcessionKindValue = (typeof CONCESSION_KINDS)[number];

export const createConcessionSchema = z.object({
  studentFeeId: z.string().min(1, 'Choose the fee'),
  kind: z.enum(CONCESSION_KINDS).default('DISCOUNT'),
  name: z.string().trim().min(2, 'Give it a name, like “Sibling discount”').max(80, 'Keep the name under 80 characters'),
  amountMinor: z.coerce.number().int().positive('Amount must be greater than zero'),
  reason: z.string().trim().min(5, 'Say why (at least 5 characters)').max(300, 'Keep the reason under 300 characters'),
});
export type CreateConcessionInput = z.input<typeof createConcessionSchema>;

export const FEE_REMINDER_KINDS = ['DUE', 'OUTSTANDING', 'OVERDUE'] as const;
export const sendFeeRemindersSchema = z
  .object({
    kind: z.enum(FEE_REMINDER_KINDS),
    studentFeeIds: z.array(z.string().min(1)).min(1).max(500).optional(),
    classId: z.string().optional(),
    sectionId: z.string().optional(),
    academicYearId: z.string().optional(),
  })
  .refine((v) => v.studentFeeIds || v.classId || v.sectionId || v.academicYearId, {
    message: 'Choose which fees to remind about: pick some, or a class, section or year.',
    path: ['studentFeeIds'],
  });
export type SendFeeRemindersInput = z.infer<typeof sendFeeRemindersSchema>;

export const FINANCE_REPORT_KINDS = [
  'daily-collection',
  'monthly-collection',
  'by-class',
  'by-section',
  'outstanding',
  'overdue',
  'payment-method',
  'cash-collection',
  'online-payments',
  'failed-payments',
  'refunds',
  'concessions',
  'scholarships',
  'summary',
  'transactions',
] as const;
export type FinanceReportKind = (typeof FINANCE_REPORT_KINDS)[number];
