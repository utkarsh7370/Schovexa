// Shared types between apps/api and apps/web.
// Kept intentionally small at Foundation stage — grows with each module
// implemented per docs/modules.md, mirroring docs/permissions.md and
// docs/database.md so both apps agree on shape without duplicating it.

export type PermissionScope =
  | 'ALL_SCHOOL'
  | 'OWN_CLASS'
  | 'OWN_SUBJECT'
  | 'OWN_STUDENTS'
  | 'OWN_CHILDREN'
  | 'SELF'
  | 'READ_ONLY';

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
