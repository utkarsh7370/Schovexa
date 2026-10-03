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
  ...perms('audit', {
    view: 'View the school’s audit log',
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
  ...perms('finance', {
    dashboard: 'View the finance dashboard',
    student: 'Look up a student’s name, class, parents’ contact and fees (nothing academic)',
    audit: 'View the finance activity log',
  }),
  ...perms('payment', {
    correct: 'Correct a recently recorded payment',
    correctAny: 'Correct a payment at any time',
  }),
  ...perms('receipt', {
    view: 'View, download, print and reprint receipts',
  }),
  ...perms('refund', {
    view: 'View refund requests',
    request: 'Request a refund',
    approve: 'Approve or reject a refund request',
    process: 'Pay out an approved refund',
  }),
  ...perms('discount', {
    view: 'View discounts, scholarships and concessions',
    request: 'Request a discount, scholarship or concession',
    apply: 'Apply a small discount or an approved concession',
    approve: 'Approve or reject a concession request',
  }),
  ...perms('financeReport', {
    view: 'View finance reports',
    export: 'Export finance data (CSV, Excel, PDF)',
  }),
  ...perms('feeNotice', {
    send: 'Send fee reminders to families',
  }),
  ...perms('department', {
    view: 'View departments',
    create: 'Create a department',
    update: 'Edit or remove a department',
  }),
  ...perms('group', {
    view: 'View houses and groups',
    create: 'Create a house or group',
    update: 'Edit a house or group and manage its members',
  }),
  ...perms('attendance', {
    requestCorrection: 'Ask for a locked attendance record to be corrected',
    approveCorrection: 'Approve or reject an attendance correction request',
  }),
  ...perms('timetable', {
    view: 'View timetables',
    manage: 'Create and change the master timetable and substitutions',
  }),
  ...perms('homework', {
    view: 'View homework',
    create: 'Set, edit and cancel homework',
    review: 'Record, review and comment on homework submissions',
  }),
  ...perms('assignment', {
    view: 'View assignments',
    create: 'Set, edit and cancel assignments',
    evaluate: 'Evaluate assignment submissions: marks and feedback',
  }),
  ...perms('exam', {
    view: 'View exams and their timetable',
    manage: 'Create exams and exam papers',
  }),
  ...perms('marks', {
    view: 'View marks',
    enter: 'Enter, submit and ask to correct marks',
    review: 'Review submitted marks (academic coordinator)',
    approve: 'Approve, publish and reopen marks',
  }),
  ...perms('result', {
    view: 'View published results',
  }),
  ...perms('content', {
    view: 'View study material',
    create: 'Create, publish and archive study material',
  }),
  ...perms('remark', {
    view: 'View teacher remarks and observations',
    create: 'Write teacher remarks and observations',
  }),
  ...perms('message', {
    view: 'Read teacher–parent messages',
    send: 'Send teacher–parent messages',
  }),
  ...perms('leave', {
    apply: 'Apply for leave and see your own requests',
    view: 'View everyone’s leave requests',
    approve: 'Approve or reject leave requests',
  }),
  ...perms('event', {
    view: 'View school events and meetings',
    manage: 'Add and edit school events and meetings',
  }),
  ...perms('teachingReport', {
    view: 'View attendance, homework, assignment and marks reports',
    export: 'Export those reports',
  }),
  ...perms('teaching', {
    dashboard: 'View the teaching dashboard',
  }),
];
