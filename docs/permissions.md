# Schovexa — Permission System

Status: Phase 0 draft. This is the authorization contract every backend
module must implement against — see `docs/architecture.md` §Authorization
for the enforcement pipeline.

## 1. Design Principle

Authorization is **permission-based**, not role-based, in application
code. Roles are just named bundles of `(permission, scope)` pairs used
for convenient assignment and UI. No controller, service, or UI component
may branch on a role name to decide behavior.

```
Bad:   if (user.role === "TEACHER") { ... }
Good:  authorize({ permission: "attendance.mark", schoolId, scope, resourceId })
```

## 2. Permission Format

```
<module>.<action>
```

Examples used across MVP + Phase 2/3 modules:

```
student.view      student.create     student.update     student.delete
parent.view        parent.create      parent.update
teacher.view       teacher.create     teacher.update
class.view         class.create       class.update
subject.view       subject.create     subject.update

attendance.view    attendance.mark    attendance.update

fee.view           fee.create         fee.collect        fee.refund

exam.view          exam.create        exam.update        exam.publish
result.view        result.enter       result.approve      result.publish

notice.view        notice.create      notice.publish

user.view          user.create        user.update        user.disable
role.view          role.create        role.update
school.view        school.update

report.view        report.export

document.view      document.upload    document.delete

audit.view
```

New modules add new `module.action` pairs; the set is stored in the
database (a `Permission` table), not hardcoded as an enum scattered
through business logic, so it can grow without a schema migration to
application code.

## 3. Permission Scopes

A scope narrows *which* resources a permission applies to. Scopes are
evaluated server-side against the actual resource, not trusted from the
client.

| Scope | Meaning |
|---|---|
| `ALL_SCHOOL` | Any resource belonging to the user's active school |
| `OWN_CLASS` | Resources tied to a class/section the user is assigned to (e.g. class teacher, subject teacher) |
| `OWN_SUBJECT` | Resources tied to a subject the user teaches |
| `OWN_STUDENTS` | Students the user is directly responsible for (e.g. a class teacher's roster) |
| `OWN_CHILDREN` | A parent's linked children only |
| `SELF` | The user's own record only |
| `READ_ONLY` | Modifier: view allowed, mutating actions denied regardless of other scope |

Scopes are stored per `RolePermission` (or per membership override) and
are extensible — adding a new scope value requires updating the
authorization evaluator, not every call site.

## 4. Example Role → Permission → Scope Matrices

**Teacher (Subject Teacher)**
```
attendance.mark   → OWN_CLASS
attendance.view   → OWN_CLASS
student.view      → OWN_STUDENTS
result.enter      → OWN_SUBJECT
homework.create   → OWN_CLASS
```

**Class Teacher** (Subject Teacher permissions plus)
```
student.view      → OWN_CLASS
notice.create     → OWN_CLASS
```

**Principal**
```
student.view       → ALL_SCHOOL
attendance.view     → ALL_SCHOOL
result.approve       → ALL_SCHOOL
teacher.view          → ALL_SCHOOL
fee.view              → ALL_SCHOOL (read-only oversight)
```

**Accountant**
```
fee.view       → ALL_SCHOOL
fee.collect    → ALL_SCHOOL
fee.refund     → ALL_SCHOOL (subject to approval workflow, Phase 2+)
student.view   → ALL_SCHOOL + READ_ONLY
```

**Parent**
```
student.view   → OWN_CHILDREN
fee.view       → OWN_CHILDREN
result.view    → OWN_CHILDREN
attendance.view→ OWN_CHILDREN
notice.view    → ALL_SCHOOL + READ_ONLY (school-wide notices)
```

**Student**
```
student.view    → SELF
result.view     → SELF
attendance.view → SELF
homework.view   → OWN_CLASS + READ_ONLY
```

## 5. Enforcement Contract

Every protected endpoint calls a single shared authorization entry point,
conceptually:

```ts
authorize({
  userId,          // from verified session, never from request body
  permission: "student.view",
  schoolId,        // derived from user's active membership, never trusted from client
  scope,           // resolved from the user's role/membership for this permission
  resourceId,      // the specific student/fee/etc. being accessed
});
```

`authorize()` must, at minimum:
1. Confirm the user has an `ACTIVE` membership in `schoolId`.
2. Confirm the membership's role grants `permission`.
3. Resolve the scope and confirm `resourceId` (when present) actually
   falls within that scope (e.g. `OWN_CLASS` → the class is one the
   membership is assigned to; `OWN_CHILDREN` → the student is linked to
   this parent).
4. Reject before any database write/read of the protected resource — not
   after fetching it, to avoid leaking existence via timing/error
   differences.

This logic lives in one reusable authorization service/guard (Phase 4),
never duplicated per controller.

## 6. Platform vs School Permissions

Platform permissions (`platform.*`, e.g. `platform.school.manage`,
`platform.subscription.manage`) are entirely separate from school-scoped
permissions and are never granted via a school `Role`. A platform admin
acting on a specific school's data (e.g. support access) must go through
an explicit, separately audited elevation path — not an implicit
superset of school permissions.

## 7. Testing Requirement

Every permission + scope combination that denies access must have an
automated test proving denial (see the Critical Security Tests list in
`docs/architecture.md` §Testing & Security). A permission system without
negative tests is unverified.
