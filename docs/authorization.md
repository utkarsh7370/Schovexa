# Schovexa — Authorization Design

Status: Step 3 design deliverable (authorization half). Implements the
enforcement side of `docs/permissions.md` and `docs/architecture.md` §6.
This is the contract every controller in every module (present and
future) must use — no module is exempt, including reports and search.

## 1. Single Entry Point

All authorization decisions go through one service, conceptually:

```ts
interface AuthorizeInput {
  userId: string;              // from verified session — never from request body
  permission: string;          // "module.action", e.g. "student.view"
  schoolId: string;            // from session.activeMembershipId — never from request body/query
  resourceId?: string;         // the specific entity being accessed, when applicable
}

authorize(input: AuthorizeInput): Promise<void>; // throws ForbiddenException / NotFoundException
```

No controller, service, or resolver is permitted to implement its own
ad hoc permission check. This is enforced procedurally (code review
checklist + a lint rule forbidding raw `role ===` comparisons) once
implementation starts.

## 2. NestJS Enforcement Shape

Two composable pieces, applied per-route via decorators:

```ts
@UseGuards(AuthGuard)              // step 1-2 of the pipeline: is there a valid session/user?
@UseGuards(SchoolContextGuard)     // step 3: resolve + verify active SchoolMembership is ACTIVE
@RequirePermission('student.view') // step 4-5: does the role grant this, and what scope?
@Get('students/:id')
async getStudent(@Param('id') id: string, @CurrentAuth() auth: AuthContext) {
  await this.authzService.authorizeResource(auth, 'student.view', 'Student', id); // step 6
  return this.studentsService.findOne(auth.schoolId, id);
}
```

- `AuthGuard`: verifies the session cookie, loads the `User`, rejects if
  not `ACTIVE`.
- `SchoolContextGuard`: loads `session.activeMembershipId`, re-verifies
  the `SchoolMembership` is `ACTIVE` (not just cached at login), attaches
  `{ userId, schoolId, membershipId, roleId }` to the request as
  `AuthContext`.
- `RequirePermission(key)` decorator + a `PermissionGuard`: looks up
  whether the role attached to `AuthContext` has `RolePermission` for
  `key`; attaches the resolved `scope` to `AuthContext` for the handler
  to use.
- The handler (or a thin service-layer wrapper) calls
  `authorizeResource(...)` to check the specific `resourceId` against the
  resolved scope — this is the step that cannot be generically
  decorator-ized because "does this resource fall in scope" is
  domain-specific (see §3).

This mirrors the pipeline defined in `docs/architecture.md` §3 exactly —
this document is that pipeline's implementation contract.

## 3. Scope Resolution Algorithm (per scope type)

Each scope type has one resolver function, reused everywhere that scope
appears — not reimplemented per module.

| Scope | Resolution query |
|---|---|
| `ALL_SCHOOL` | No further check beyond `resource.schoolId === auth.schoolId`. |
| `SELF` | `resource belongs to auth.userId` (e.g. `Student.userId === auth.userId` once student portal accounts exist, or `resource.id === auth.studentProfileId`). |
| `OWN_CHILDREN` | `StudentParent` row exists linking `auth.parentProfileId` (resolved from `auth.userId` + `schoolId`) to the target `studentId`. |
| `OWN_STUDENTS` | The target student's `sectionId` is one where `auth.teacherProfileId` is the `classTeacherId` (Section.classTeacherId), or is covered by a `TeacherAssignment`. |
| `OWN_CLASS` | `TeacherAssignment` row exists for `auth.teacherProfileId` + the target `sectionId` (any subject), or `Section.classTeacherId === auth.teacherProfileId`. |
| `OWN_SUBJECT` | `TeacherAssignment` row exists for `auth.teacherProfileId` + the target `sectionId` + the specific `subjectId` in question. |
| `READ_ONLY` (modifier) | Combined with another scope; if the requested action is a mutation (`create`/`update`/`delete`/`collect`/`publish`/etc.) and the role's grant for this permission carries `READ_ONLY`, deny regardless of the base scope passing. |

Each resolver is a pure function of `(authContext, resourceId) => boolean`
backed by a single indexed query (see `docs/database.md` §4–5 for the
`TeacherAssignment` / `StudentParent` tables these depend on) — never an
in-memory filter over a full table scan.

## 4. Denial Semantics

- **401 Unauthorized**: no valid session at all (fails `AuthGuard`).
- **403 Forbidden**: valid session, but the role does not grant the
  requested permission at all (fails `PermissionGuard`).
- **404 Not Found**: valid session, permission technically exists on the
  role, but the specific `resourceId` falls outside the resolved scope
  (e.g. a teacher requesting a student in a class they don't teach) —
  returning 404 rather than 403 here avoids confirming that the resource
  exists in another tenant/scope to a user who shouldn't know that.
- Cross-tenant requests (a `resourceId` belonging to a different
  `schoolId` entirely) always resolve as 404, never 403 — a user should
  never be able to distinguish "this belongs to another school" from
  "this doesn't exist."

## 5. Data-Layer Defense in Depth

The application-layer `authorize()` call is the primary control, but
every Prisma query in a domain service is additionally required to
filter by `schoolId` explicitly (`where: { schoolId: auth.schoolId, ... }`)
as a second, independent layer — so a bug that skips the guard on one
route still cannot leak cross-tenant data from that route's query. See
`docs/multi-tenancy.md` §3 for the Prisma-level pattern (a query
middleware/base-repository convention), which is the concrete mechanism
for this defense-in-depth layer.

## 6. Feature Entitlement Checks

Subscription/feature-flag checks (`docs/architecture.md` §12) run through
the same `authorize()` call path, not a separate ad hoc check: a route
gated behind a paid feature (e.g. `whatsapp.send`) fails with 403 if the
school's active `Subscription` → `Plan` → `Feature` set does not include
it, evaluated server-side before the handler runs — never only hidden in
the frontend navigation.

## 7. CSRF, Sessions, and This Layer's Boundary

Authorization (this document) assumes the request is already
authenticated (`docs/authentication.md`) and not forged
(CSRF protection — double-submit cookie or `SameSite` + custom header
check on state-changing requests, applied at the HTTP layer, orthogonal
to permission/scope checks). Authorization does not attempt to solve
CSRF; it solves "given a legitimate request from this session, is this
action allowed."

## 8. Platform Admin Elevation

Platform roles (`docs/user-roles.md` §2) do not carry any
`RolePermission` rows scoped to a specific school. A platform admin
acting on school data must go through a distinct, explicit
`platform.school.impersonate`-style permission that:
1. Requires its own audited action (reason logged, not optional).
2. Produces a time-boxed elevated `AuthContext` for that one school.
3. Is itself visible in that school's own audit log, not hidden from the
   school's admins — a school should be able to see when platform staff
   accessed their data.

This is designed now so it is never retrofitted as a bypass later.

## 9. Testing Requirements for This Design

Every `(permission, scope)` pair that should deny access has an
automated negative test (see the cross-tenant test matrix in
`docs/architecture.md` §14 and `docs/multi-tenancy.md` §5). In addition:

- A role with permission but wrong scope is denied (e.g. teacher with
  `attendance.mark: OWN_CLASS` cannot mark attendance for a class they
  are not assigned to).
- A role without the permission at all is denied regardless of scope.
- `READ_ONLY` modifier blocks mutation verbs even when the base scope
  would otherwise pass.
- Feature-gated routes deny when the school's plan lacks the feature,
  independent of the user's permission grants.
- Platform-role tokens cannot access school-scoped routes without the
  explicit elevation path in §8.
