import type { Permission, PermissionScope } from '@prisma/client';

export interface DefaultRoleGrant {
  permissionKey: string;
  scope: PermissionScope;
  readOnly?: boolean;
}

export interface DefaultRoleDefinition {
  name: string;
  grants: DefaultRoleGrant[];
}

// Default roles seeded for every newly registered school
// (docs/user-roles.md §3, docs/product-requirements.md §7 onboarding
// flow). Deliberately a small, USEFUL subset of the full role catalog
// the brief lists — a role like "Librarian" would need library.*
// permissions that don't exist yet (Library is a Phase 3-tier module,
// docs/modules.md), and seeding a role with zero real permissions would
// be misleading, not helpful. More default roles are added here as the
// permissions they need are added to the catalog by later modules.
//
// Director gets every permission currently in the catalog — computed
// dynamically (not hardcoded per key) so it never silently falls behind
// as the catalog grows.
export function getDefaultRoleDefinitions(catalog: Permission[]): DefaultRoleDefinition[] {
  const byKey = (key: string) => catalog.find((p) => p.key === key);

  const director: DefaultRoleDefinition = {
    name: 'Director',
    grants: catalog.map((permission) => ({ permissionKey: permission.key, scope: 'ALL_SCHOOL' })),
  };

  // Principal runs the school day to day alongside the Director — every
  // permission except the ones that change who may do what or how the
  // school itself is configured. It can add/edit/delete holidays, publish
  // notices, manage fees and so on. A school can adjust this on the Roles
  // page like any other role.
  // The Principal proposes academic years; only the Director approves them.
  const PRINCIPAL_EXCLUDED = new Set(['role.create', 'role.update', 'school.update', 'user.disable', 'academicYear.approve', 'audit.view']);
  const principal: DefaultRoleDefinition = {
    name: 'Principal',
    grants: catalog
      .filter((permission) => !PRINCIPAL_EXCLUDED.has(permission.key))
      .map((permission) => ({ permissionKey: permission.key, scope: 'ALL_SCHOOL' as PermissionScope })),
  };

  const teacher: DefaultRoleDefinition = {
    name: 'Teacher',
    grants: [
      byKey('attendance.mark') && { permissionKey: 'attendance.mark', scope: 'OWN_CLASS' as PermissionScope },
      byKey('attendance.view') && { permissionKey: 'attendance.view', scope: 'OWN_CLASS' as PermissionScope },
      byKey('student.view') && { permissionKey: 'student.view', scope: 'OWN_STUDENTS' as PermissionScope },
      byKey('class.view') && { permissionKey: 'class.view', scope: 'OWN_CLASS' as PermissionScope },
      byKey('subject.view') && { permissionKey: 'subject.view', scope: 'OWN_SUBJECT' as PermissionScope },
      byKey('notice.view') && { permissionKey: 'notice.view', scope: 'ALL_SCHOOL' as PermissionScope },
      byKey('staffAttendance.mark') && { permissionKey: 'staffAttendance.mark', scope: 'SELF' as PermissionScope },
      byKey('holiday.view') && { permissionKey: 'holiday.view', scope: 'ALL_SCHOOL' as PermissionScope },
      byKey('department.view') && { permissionKey: 'department.view', scope: 'ALL_SCHOOL' as PermissionScope },
      byKey('group.view') && { permissionKey: 'group.view', scope: 'ALL_SCHOOL' as PermissionScope },
    ].filter((grant): grant is DefaultRoleGrant => !!grant),
  };

  // The Accountant has full operational access to finance and limited,
  // read-only access to student information — and no administrative authority
  // outside finance. Deliberately NOT granted: student.view (the finance student
  // lookup shows only what money work needs), fee.refund (writing a fee off),
  // refund.approve / discount.approve / payment.correctAny (those belong to the
  // Principal and Director — the accountant requests, someone else approves).
  const accountantKeys = [
    'fee.view',
    'fee.create',
    'fee.collect',
    'finance.dashboard',
    'finance.student',
    'finance.audit',
    'payment.correct',
    'receipt.view',
    'refund.view',
    'refund.request',
    'refund.process',
    'discount.view',
    'discount.request',
    'discount.apply',
    'financeReport.view',
    'financeReport.export',
    'feeNotice.send',
    'notice.view',
    'staffAttendance.mark',
    'holiday.view',
  ];
  const accountant: DefaultRoleDefinition = {
    name: 'Accountant',
    grants: accountantKeys.filter((key) => byKey(key)).map((permissionKey) => ({ permissionKey, scope: (permissionKey === 'staffAttendance.mark' ? 'SELF' : 'ALL_SCHOOL') as PermissionScope })),
  };

  const receptionist: DefaultRoleDefinition = {
    name: 'Receptionist',
    grants: [
      byKey('student.view') && { permissionKey: 'student.view', scope: 'ALL_SCHOOL' as PermissionScope },
      byKey('student.create') && { permissionKey: 'student.create', scope: 'ALL_SCHOOL' as PermissionScope },
      byKey('student.update') && { permissionKey: 'student.update', scope: 'ALL_SCHOOL' as PermissionScope },
      // Front desk registers parent contacts during admission — the
      // sidebar has always linked to Parents for this role; it 403'd on
      // click until this grant existed (UI/UX audit finding, not a new
      // feature).
      byKey('parent.view') && { permissionKey: 'parent.view', scope: 'ALL_SCHOOL' as PermissionScope },
      byKey('parent.create') && { permissionKey: 'parent.create', scope: 'ALL_SCHOOL' as PermissionScope },
      byKey('parent.update') && { permissionKey: 'parent.update', scope: 'ALL_SCHOOL' as PermissionScope },
      byKey('notice.view') && { permissionKey: 'notice.view', scope: 'ALL_SCHOOL' as PermissionScope },
      byKey('staffAttendance.mark') && { permissionKey: 'staffAttendance.mark', scope: 'SELF' as PermissionScope },
      byKey('holiday.view') && { permissionKey: 'holiday.view', scope: 'ALL_SCHOOL' as PermissionScope },
    ].filter((grant): grant is DefaultRoleGrant => !!grant),
  };

  // OWN_CHILDREN only resolves once a Parent row's userId is set (a
  // later phase wires up inviting a parent to the portal and linking
  // that login to their Parent profile) — seeded now regardless, same
  // as Teacher's attendance.* grants existed before Attendance was
  // built, so the role is ready the moment that linking lands.
  const parent: DefaultRoleDefinition = {
    name: 'Parent',
    grants: [
      byKey('student.view') && { permissionKey: 'student.view', scope: 'OWN_CHILDREN' as PermissionScope },
      byKey('attendance.view') && { permissionKey: 'attendance.view', scope: 'OWN_CHILDREN' as PermissionScope },
      byKey('fee.view') && { permissionKey: 'fee.view', scope: 'OWN_CHILDREN' as PermissionScope },
      byKey('receipt.view') && { permissionKey: 'receipt.view', scope: 'OWN_CHILDREN' as PermissionScope },
      byKey('notice.view') && { permissionKey: 'notice.view', scope: 'ALL_SCHOOL' as PermissionScope },
      byKey('holiday.view') && { permissionKey: 'holiday.view', scope: 'ALL_SCHOOL' as PermissionScope },
    ].filter((grant): grant is DefaultRoleGrant => !!grant),
  };

  return [director, principal, teacher, accountant, receptionist, parent];
}
