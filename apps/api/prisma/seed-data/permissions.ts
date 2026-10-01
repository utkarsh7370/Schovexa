// The global Permission catalog — module.action keys, per docs/permissions.md
// §2. This is platform-level data (not per-school) seeded once. New
// permissions are appended here as each module is implemented; existing
// keys are never removed once a school's RolePermission may reference them.

export interface PermissionSeed {
  key: string;
  module: string;
  action: string;
  description: string;
}

function perms(module: string, actions: Record<string, string>): PermissionSeed[] {
  return Object.entries(actions).map(([action, description]) => ({
    key: `${module}.${action}`,
    module,
    action,
    description,
  }));
}

export const permissionCatalog: PermissionSeed[] = [
  ...perms('student', {
    view: 'View student records',
    create: 'Create a student record',
    update: 'Update a student record',
    delete: 'Soft-delete a student record',
  }),
  ...perms('parent', {
    view: 'View parent records',
    create: 'Create a parent record',
    update: 'Update a parent record',
  }),
  ...perms('teacher', {
    view: 'View teacher records',
    create: 'Create a teacher record',
    update: 'Update a teacher record',
  }),
  ...perms('class', {
    view: 'View classes',
    create: 'Create a class',
    update: 'Update a class',
  }),
  ...perms('subject', {
    view: 'View subjects',
    create: 'Create a subject',
    update: 'Update a subject',
  }),
  ...perms('attendance', {
    view: 'View attendance records',
    mark: 'Mark attendance',
    update: 'Correct a previously marked attendance record',
  }),
  ...perms('fee', {
    view: 'View fee records',
    create: 'Create a fee structure/assignment',
    collect: 'Record a fee payment',
    refund: 'Process a fee refund',
  }),
  ...perms('notice', {
    view: 'View notices',
    create: 'Draft a notice',
    publish: 'Publish a notice to its audience',
  }),
  ...perms('user', {
    view: 'View user accounts',
    create: 'Invite/create a user account',
    update: 'Update a user account',
    disable: 'Disable a user account',
  }),
  ...perms('academicYear', {
    view: 'View academic years',
    create: 'Create an academic year',
    update: 'Update an academic year (e.g. mark it current)',
    approve: 'Approve, reject or send back a proposed academic year',
  }),
  ...perms('staffAttendance', {
    mark: 'Punch in and out for yourself',
    view: 'View the whole staff’s attendance',
    approve: 'Approve or reject staff attendance',
  }),
  ...perms('role', {
    view: 'View roles',
    create: 'Create a role',
    update: 'Update a role and its permissions',
  }),
  ...perms('school', {
    view: 'View school settings',
    update: 'Update school settings',
  }),
  ...perms('report', {
    view: 'View reports',
    export: 'Export a report',
  }),
  ...perms('document', {
    view: 'View documents',
    upload: 'Upload a document',
    delete: 'Delete a document',
  }),
  ...perms('holiday', {
    view: 'View the school holiday calendar',
    create: 'Add a holiday',
    update: 'Edit a holiday',
    delete: 'Delete a holiday',
  }),
  ...perms('audit', {
    view: 'View the audit log',
  }),
];
