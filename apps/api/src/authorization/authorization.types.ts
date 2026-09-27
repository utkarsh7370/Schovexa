import type { PermissionScope } from '@prisma/client';

// Attached to the request by SchoolContextGuard (base fields) and then
// PermissionGuard (scope/readOnly/action, once a specific route's
// @RequirePermission has been resolved). See docs/authorization.md §2.
export interface AuthContext {
  userId: string;
  schoolId: string;
  membershipId: string;
  roleId: string;
  scope?: PermissionScope;
  readOnly?: boolean;
  permissionAction?: string;
}

// Resource types the scope resolvers know how to check. Kept as a small,
// explicit union — extended one entry at a time as each business module
// is built, never speculatively ahead of a real resourceId check that
// needs it (docs/authorization.md §3).
export type ResourceType =
  | 'User'
  | 'Student'
  | 'Class'
  | 'Section'
  | 'Subject'
  | 'Teacher'
  | 'Role'
  | 'AcademicYear'
  | 'SchoolMembership';
