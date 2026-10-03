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
  // Where to fetch this person's own photo (through the session); null when they have none.
  photoUrl: string | null;
  // The session's actively-selected school, if any — null means no
  // school is selected yet (send the user to pick one). This is
  // session state, not a permission check: it must stay readable by
  // every authenticated role so the frontend can tell "no active
  // school" apart from "active school, but this role can't view its
  // settings" (GET /schools/me is gated by school.view and 403s for
  // the second case too — conflating the two sent every role without
  // school.view into a redirect loop, caught via Phase 10 live
  // verification with a Teacher login).
  activeSchoolId: string | null;
  // Permission keys the active school's role grants (e.g. 'holiday.create').
  // For showing or hiding controls only — every API route still enforces
  // its own permission, so this is a convenience, never a security check.
  permissions: string[];
  // Where each of those permissions applies (ALL_SCHOOL, OWN_CLASS, …) — lets a screen offer a teacher only the
  // classes they teach. Again a convenience: the API enforces the real scope.
  permissionScopes: Record<string, PermissionScope>;
  // Where the active school is (ISO 3166-1 alpha-2) — readable by every
  // role, since the header shows it to teachers and parents too.
  schoolCountry: string | null;
  // Has this person proved they own their email address? Some sensitive
  // actions (inviting staff, changing roles) wait until they have.
  emailVerified: boolean;
  memberships: SchoolMembershipSummary[];
}
