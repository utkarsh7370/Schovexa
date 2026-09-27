// Shared types between apps/api and apps/web.
// Kept intentionally small at Foundation stage — grows with each module
// implemented per docs/modules.md, mirroring docs/permissions.md and
// docs/database.md so both apps agree on shape without duplicating it.

// Location scopes only — READ_ONLY is a separate modifier (see
// docs/permissions.md §3 and the RolePermission.readOnly column), not a
// location value, so it isn't part of this union.
export type PermissionScope =
  | 'ALL_SCHOOL'
  | 'OWN_CLASS'
  | 'OWN_SUBJECT'
  | 'OWN_STUDENTS'
  | 'OWN_CHILDREN'
  | 'SELF';

export type UserStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED' | 'DELETED';

export type MembershipStatus = 'ACTIVE' | 'SUSPENDED' | 'DISABLED';

export interface AuthContext {
  userId: string;
  schoolId: string;
  membershipId: string;
  roleId: string;
}

export interface SchoolMembershipSummary {
  membershipId: string;
  schoolId: string;
  schoolName: string;
  roleName: string;
  status: MembershipStatus;
}

export interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  memberships: SchoolMembershipSummary[];
}
