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
  const PRINCIPAL_EXCLUDED = new Set(['role.create', 'role.update', 'school.update', 'user.disable']);
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
      byKey('holiday.view') && { permissionKey: 'holiday.view', scope: 'ALL_SCHOOL' as PermissionScope },
    ].filter((grant): grant is DefaultRoleGrant => !!grant),
  };

  const accountant: DefaultRoleDefinition = {
    name: 'Accountant',
    grants: [
      byKey('fee.view') && { permissionKey: 'fee.view', scope: 'ALL_SCHOOL' as PermissionScope },
      byKey('fee.create') && { permissionKey: 'fee.create', scope: 'ALL_SCHOOL' as PermissionScope },
      byKey('fee.collect') && { permissionKey: 'fee.collect', scope: 'ALL_SCHOOL' as PermissionScope },
      byKey('fee.refund') && { permissionKey: 'fee.refund', scope: 'ALL_SCHOOL' as PermissionScope },
      byKey('student.view') && {
        permissionKey: 'student.view',
        scope: 'ALL_SCHOOL' as PermissionScope,
        readOnly: true,
      },
      byKey('notice.view') && { permissionKey: 'notice.view', scope: 'ALL_SCHOOL' as PermissionScope },
      byKey('holiday.view') && { permissionKey: 'holiday.view', scope: 'ALL_SCHOOL' as PermissionScope },
    ].filter((grant): grant is DefaultRoleGrant => !!grant),
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
      byKey('notice.view') && { permissionKey: 'notice.view', scope: 'ALL_SCHOOL' as PermissionScope },
      byKey('holiday.view') && { permissionKey: 'holiday.view', scope: 'ALL_SCHOOL' as PermissionScope },
    ].filter((grant): grant is DefaultRoleGrant => !!grant),
  };

  return [director, principal, teacher, accountant, receptionist, parent];
}
