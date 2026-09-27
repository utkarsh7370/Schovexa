# Schovexa — Multi-Tenancy Design

Status: Step 4 design deliverable. Expands `docs/architecture.md` §3–4
into an implementable design: how tenant context is established,
propagated, and enforced at every layer, and how it is tested.

## 1. Tenancy Model Recap

Logical (shared-database, shared-schema) multi-tenancy. Every
school-owned row carries `schoolId` (see `docs/database.md`). Chosen over
schema-per-tenant or database-per-tenant because at the expected scale
(single-digit to low-hundreds of schools in year one) the operational
cost of per-tenant infrastructure (migrations × N, backups × N,
connection pool exhaustion) outweighs the isolation benefit, which is
instead achieved through disciplined, tested, server-enforced query
scoping. This can be revisited if a specific school later requires
dedicated infrastructure (e.g. a contractual data-residency requirement)
— the schema does not prevent extracting one tenant later.

## 2. Tenant Context Lifecycle

```
Login
  → User authenticated, no active school yet (session.activeMembershipId = null)
  → GET /auth/me returns the user's SchoolMembership list
  → Client calls POST /auth/select-school { membershipId }
  → Server verifies that membership belongs to this user and is ACTIVE
  → session.activeMembershipId = membershipId (server-side, not client-editable)
  → Every subsequent request resolves schoolId from session.activeMembershipId
```

`schoolId` therefore never appears as a value the client can set — not
in the login payload, not in a header, not in a request body field the
server trusts. Any endpoint that appears to need a `schoolId` parameter
(e.g. a platform-admin endpoint listing schools) is a platform-scoped
endpoint governed by `docs/authorization.md` §8, not a tenant-scoped one.

Switching schools (for a future multi-membership user) always
re-invokes `select-school` — it is a deliberate, server-validated action,
never inferred from a request parameter.

## 3. Request-Time Enforcement (defense in depth, two independent layers)

**Layer 1 — Guard pipeline** (`docs/authorization.md` §2): resolves and
verifies `schoolId` from session before the handler runs; injects
`AuthContext { userId, schoolId, membershipId, roleId }`.

**Layer 2 — Repository/query convention**: every Prisma query touching a
school-owned table includes `schoolId: auth.schoolId` in its `where`
clause, enforced by convention plus a lightweight guard rail at
implementation time — e.g. a base repository class that requires
`schoolId` as a mandatory constructor/method argument, so a query
literally cannot be written without it:

```ts
class TenantScopedRepository<T> {
  constructor(protected readonly schoolId: string) {}
  // every method signature bakes in `where: { schoolId: this.schoolId, ... }`
}
```

A Prisma client-extension/middleware that auto-injects `schoolId` into
every query for school-owned models is evaluated at implementation time
as an additional safety net (it must not silently allow a query with no
tenant context to run unfiltered — fail closed, not open, if `schoolId`
is missing from the extension's context).

The two layers are independent on purpose: a mistake in one (e.g. a
missing guard on a new route) does not by itself produce a cross-tenant
leak if the other layer still filters correctly.

## 4. IDOR Prevention

Every endpoint that accepts a resource identifier (`:id`, `:studentId`,
etc.) must, before returning or mutating data:
1. Fetch the resource filtered by `schoolId = auth.schoolId` (Layer 2
   above) — a resource ID from another school simply does not match and
   returns "not found," not "forbidden" (see `docs/authorization.md` §4
   on why 404 is used here).
2. Additionally pass through `authorize()` for permission + scope
   (`docs/authorization.md` §1, §3) — schoolId match alone is necessary
   but not sufficient (e.g. a teacher and a fellow teacher are in the
   same school but the resource may still be out of the requester's
   `OWN_CLASS` scope).

Sequential IDs are avoided for externally-referenced identifiers
(`cuid()` per `docs/database.md` conventions) so enumeration by
incrementing an ID is not viable even before authorization is checked.

## 5. Cross-Tenant Test Matrix (binding for Step 6 implementation)

This is the authoritative version of the list introduced in
`docs/architecture.md` §14 — every row must exist as an automated
integration test before a module is considered complete, and CI must
fail the build if any of these tests are skipped, marked pending, or
deleted without replacement:

```
1. School A user               → School B student record        → 404
2. School A admin               → School B fee/payment record     → 404
3. Teacher                       → section they are not assigned to → 404
4. Teacher                       → subject they do not teach        → 404
5. Student                        → another student's record        → 404
6. Parent                         → a child not linked to them       → 404
7. Accountant                      → admin-only school settings      → 403
8. School-scoped user               → any platform admin endpoint     → 403
9. Disabled user (mid-session)        → any protected endpoint         → 401
10. Session past expiry               → any protected endpoint         → 401
11. Suspended SchoolMembership          → endpoints scoped to that school → 401/403
12. Client-supplied schoolId differing → server's session-derived schoolId is used, client value ignored/rejected
```

Row 12 specifically guards against the anti-pattern called out in the
master brief: `where: { schoolId: request.body.schoolId }`. The test
sends a request with a `schoolId`-shaped field in the body pointing at a
different (valid) school and asserts the server still only ever touches
the session's actual active school — proving the field is ignored, not
merely that a mismatched value errors.

## 6. Tenant Isolation and Background Jobs

When background jobs are introduced (Phase 2, `docs/architecture.md`
§11), every job payload includes an explicit `schoolId` set by the
enqueuing request's already-validated `AuthContext` — never re-derived
from user input inside the worker. Workers apply the same Layer 2
query-scoping convention as HTTP handlers; a worker is not a trusted
context that bypasses tenant filtering just because it's not
HTTP-facing.

## 7. Tenant Isolation and Reports/Search

Reports and global search (`docs/architecture.md` §26–27) are explicitly
named in the brief as places tenant/permission enforcement is easy to
forget because they aggregate across many tables. Design rule: the
report/search query builder takes `AuthContext` as a required first
argument and applies both the `schoolId` filter and the resolved
permission scope (e.g. a teacher's search only ever queries within
`OWN_STUDENTS`) inside the query itself — never by fetching broadly and
filtering the result set in application code after the fact (which risks
partial pagination leaking counts/existence of out-of-scope rows).

## 8. Future: Per-School Subdomains

Not implemented in MVP. The design does not block it: `School.slug`
(see `docs/database.md` §2) already exists for this purpose, and tenant
resolution is session-based, not hostname-based, so a future hostname →
school hint can be layered on as a *convenience* (pre-filling which
membership to select) without ever being trusted as the actual
authorization boundary — the session-derived `schoolId` remains
authoritative regardless of which hostname/subdomain the request arrived
on.

## 9. Summary Invariant

> No authenticated request may read or write a school-owned resource
> unless the server has independently verified, from session state it
> controls: an active membership in that school, a role granting the
> required permission, a scope that covers the specific resource, and a
> `schoolId` match at the query layer.

This sentence is the acceptance criterion for every module built from
Step 6 onward — a module that cannot satisfy it for every one of its
endpoints is not done.
