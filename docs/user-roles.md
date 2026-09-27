# Schovexa — User Roles

Status: Phase 0 draft. Roles are seed data, not hardcoded logic — see
`docs/permissions.md` for how behavior is actually driven (by permission +
scope, never by role name comparisons in code).

## 1. Role Model

```
User ──< SchoolMembership >── School
              │
              └── Role ──< RolePermission >── Permission (+ scope)
```

- A `User` is a global identity (one login, one password).
- A `SchoolMembership` binds a user to exactly one school with exactly one
  primary `Role` for that membership (a user may hold multiple
  memberships across schools in the future — e.g. a teacher consulting at
  two schools — each membership independently scoped).
- A `Role` is school-scoped (except Platform roles, which are global) and
  is a named bundle of permissions. Schools may clone/customize roles;
  the platform ships default roles per school on creation.
- Business logic must never branch on role name (`if role === "TEACHER"`).
  It must check permission + scope (`can("attendance.mark", { scope:
  "OWN_CLASS" })`).

## 2. Platform Roles (global, not tied to a school)

| Role | Purpose | Notes |
|---|---|---|
| Super Admin | Full platform control | Schools, subscriptions, platform users, system config |
| Platform Support Admin | Customer support | Read-heavy access, limited write, always audited |
| Platform Finance/Admin | Billing & subscriptions | Plans, invoices, entitlements |

Platform roles do **not** implicitly grant access to a specific school's
operational data (students, fees, results). Any platform-to-school access
(e.g. support debugging an issue) must be an explicit, audited action —
never a silent bypass of the tenant authorization pipeline.

## 3. Default School Roles (seeded per school, customizable)

| Role | Typical scope shape |
|---|---|
| Director / Owner | ALL_SCHOOL on nearly everything, including financial |
| Principal | ALL_SCHOOL on academics, attendance, approvals |
| Vice Principal | Same as Principal, typically minus some financial/admin actions |
| School Administrator | ALL_SCHOOL on user/records/config management |
| Academic Coordinator | ALL_SCHOOL on curriculum/exam review, not financial |
| Accountant | ALL_SCHOOL on fee/payment/receipt, no academic edit |
| Teacher (Subject Teacher) | OWN_SUBJECT / OWN_CLASS scoped |
| Class Teacher | OWN_CLASS scoped, plus small admin duties for that class |
| Receptionist | Admissions/front-desk record entry, narrow scope |
| Librarian | Library module only (Phase 3) |
| HR / Staff Manager | Staff records, leave (Phase 2/3) |
| Transport Manager | Transport module only (Phase 3) |
| Inventory Manager | Inventory module only (Phase 3) |
| Parent | OWN_CHILDREN scoped, read-mostly |
| Student | SELF scoped, read-mostly |

Schools can rename, clone, or create entirely custom roles by composing
permissions + scopes — the table above is the seed default, not a fixed
enum enforced in code.

## 4. Role Lifecycle

- Roles are created per-school (except platform roles).
- A school's default roles are seeded during onboarding (see
  `docs/product-requirements.md` §7).
- Deleting/deactivating a role in use must be blocked or require
  reassignment of affected memberships first — never leave a membership
  with a dangling role reference.
- Role and permission changes are audit-logged (actor, school, role,
  before/after permission set).

## 5. Account States (per User, not per membership)

```
INVITED → ACTIVE → SUSPENDED / DISABLED → DELETED (soft)
```

- `INVITED`: account created via invitation, not yet logged in.
- `ACTIVE`: normal operating state.
- `SUSPENDED`: temporarily blocked (e.g. non-payment, policy) — can be
  reactivated.
- `DISABLED`: administratively deactivated (e.g. staff left) — soft,
  preserves history.
- `DELETED`: soft-deleted; excluded from active queries but retained for
  audit/financial history per retention rules.

A disabled/suspended/deleted user must fail authorization at the
membership-verification step of the pipeline (see
`docs/architecture.md` §Authorization), not rely on the frontend to hide
UI.
