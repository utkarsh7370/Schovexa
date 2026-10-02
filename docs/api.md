# Schovexa — API Architecture

Status: Phase 1 design deliverable (closes the API-architecture gap
tracked in `docs/architecture.md` §16). Defines the contract every
endpoint follows; the endpoint-by-endpoint reference grows as each
module is implemented, appended to §7 below rather than pre-invented.

## 1. Versioning & Base Path

```
https://api.schovexa.com/api/v1/...
```

- All routes are prefixed `/api/v1` (already applied globally in
  `apps/api/src/main.ts` via `app.setGlobalPrefix('api/v1')`).
- A breaking change to an existing endpoint's contract ships as `/api/v2`
  for that resource rather than mutating `/api/v1` in place; additive
  changes (new optional field, new endpoint) do not require a version
  bump.

## 2. Resource Paths

Plural nouns, nested only where the nesting reflects real ownership:

```
/api/v1/auth/*                     (docs/authentication.md §3)
/api/v1/schools
/api/v1/schools/:schoolId/settings
/api/v1/users
/api/v1/roles
/api/v1/permissions
/api/v1/students
/api/v1/parents
/api/v1/teachers
/api/v1/classes
/api/v1/sections
/api/v1/subjects
/api/v1/attendance
/api/v1/fees
/api/v1/payments
/api/v1/notices
/api/v1/reports
/api/v1/audit
/api/v1/health                     (implemented, unauthenticated)
```

`schoolId` never appears as a client-supplied route/query/body parameter
for tenant-scoped resources (`/students`, `/attendance`, `/fees`, etc.) —
it is resolved server-side from the session per `docs/multi-tenancy.md`
§2. It appears explicitly only in genuinely platform-scoped routes
(e.g. `/api/v1/platform/schools/:id`) where a platform admin is
addressing a specific school by design, governed by
`docs/authorization.md` §8.

## 3. Request / Response Conventions

**Success envelope** — a resource or list directly, no unnecessary
wrapper:

```json
// GET /api/v1/students/:id
{ "id": "...", "firstName": "...", "lastName": "...", "sectionId": "..." }
```

```json
// GET /api/v1/students (list)
{
  "data": [ { "id": "...", ... } ],
  "meta": { "page": 1, "pageSize": 20, "total": 137 }
}
```

**Error envelope** — consistent shape for every 4xx/5xx, produced by a
single global exception filter, never a raw framework/database error:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "email must be a valid email address",
    "details": [{ "field": "email", "message": "Invalid email" }]
  }
}
```

- `code` is a stable machine-readable string (`UNAUTHORIZED`,
  `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_FAILED`, `CONFLICT`,
  `RATE_LIMITED`, `INTERNAL_ERROR`) — frontend code branches on `code`,
  never on `message` text.
- `message` is safe for display; it never contains a stack trace, SQL
  fragment, file path, or internal identifier beyond what the user
  already has access to.
- `details` is present only for `VALIDATION_FAILED` and mirrors the Zod/
  class-validator field errors.

## 4. HTTP Status Codes (binding)

| Code | Meaning here |
|---|---|
| 200 | Success (GET, successful mutation returning a body) |
| 201 | Resource created |
| 204 | Success, no body (e.g. DELETE) |
| 400 | Malformed request / validation failure |
| 401 | No valid session (`docs/authentication.md`) |
| 403 | Valid session, permission genuinely absent, or feature not entitled |
| 404 | Resource doesn't exist **or** exists outside the caller's tenant/scope (`docs/authorization.md` §4 — deliberately indistinguishable) |
| 409 | Conflict (e.g. duplicate admission number, concurrent update) |
| 422 | Semantically invalid but well-formed (business rule violation) |
| 429 | Rate limited (`docs/authentication.md` §4) |
| 500 | Unhandled server error — logged with full detail server-side, returned to the client as a generic `INTERNAL_ERROR` with no internal detail |

## 5. Pagination, Filtering, Sorting

List endpoints accept:

```
GET /api/v1/students?page=1&pageSize=20&sortBy=lastName&sortOrder=asc&status=ENROLLED
```

- `page`/`pageSize` are always required in effect (server applies a
  default and a hard maximum `pageSize`, e.g. 100) — no endpoint returns
  an entire table unbounded, per `docs/architecture.md` §27/§37.
- Filters are explicit, allow-listed query params per endpoint (never a
  generic `where` passthrough) — this is also what keeps filtering
  tenant/scope-safe, since the filter builder always starts from the
  `AuthContext`-scoped base query (`docs/multi-tenancy.md` §7), and a
  client-supplied filter can only narrow it further, never widen it.
- CSV export (`docs/architecture.md` §27) is a separate endpoint
  (`GET /api/v1/reports/:report/export`) rather than a `format=csv` flag
  on the JSON endpoint, so export permission/rate-limiting can differ
  from view permission.

## 6. Idempotency

Mutation endpoints with real-world side effects that could be
double-submitted (payment recording, refund processing) accept an
`Idempotency-Key` header; a repeated request with the same key and same
authenticated user returns the original result rather than creating a
duplicate record. This matters most once payment gateway webhooks
(`docs/architecture.md` §10) are implemented in Phase 2, but the header
convention is established now so early endpoints (e.g. manually recorded
MVP payments) are consistent with it.

School-rule error codes: `NOT_A_SCHOOL_DAY` and `ATTENDANCE_LOCKED` (attendance),
`PARTIAL_PAYMENT_NOT_ALLOWED` (fees), `ALREADY_IN_HOUSE` (groups). See
`docs/school-management.md`.

Two error codes are part of the contract for sensitive actions:
`403 REAUTH_REQUIRED` (confirm the password via `/auth/reauth`, then
retry) and `403 EMAIL_NOT_VERIFIED`. Rules: `docs/security-rules.md`.

## 7. Endpoint Reference (grows per module — current state only)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/v1/health` | None | Liveness + DB connectivity check, no internal detail |
| POST | `/api/v1/auth/login` | None | Locks an email after 5 failures / 15 min (`429 TOO_MANY_ATTEMPTS`); `rememberMe` gives a 30-day cookie; sets the session cookie |
| POST | `/api/v1/auth/logout` | Session | Idempotent; clears the session cookie |
| GET | `/api/v1/auth/me` | Session | Current user + their school memberships |
| POST | `/api/v1/auth/select-school` | Session | Re-verifies membership server-side before attaching it to the session |
| POST | `/api/v1/auth/forgot-password` | None | Rate limited; always 200, generic body (no enumeration) |
| POST | `/api/v1/auth/reset-password` | None | Single-use token; invalidates all other sessions on success |
| POST | `/api/v1/auth/accept-invite` | None | Single-use token; activates an `INVITED` user |
| POST | `/api/v1/auth/change-password` | Session | Needs the current password; signs out other devices; same password policy |
| POST | `/api/v1/auth/reauth` | Session | Confirm the password for sensitive actions (valid 10 min); counts toward lockout |
| GET | `/api/v1/auth/sessions` | Session | The signed-in devices (browser, OS, IP, last active) |
| DELETE | `/api/v1/auth/sessions/:id` | Session | Sign one other device out (404 for anyone else's session) |
| POST | `/api/v1/auth/sessions/revoke-others` | Session | Sign every other device out; returns `{ revoked }` |
| GET | `/api/v1/auth/activity` | Session | The person's own security activity (sign-ins, failures, password changes) |
| POST | `/api/v1/auth/verify-email` | None | Single-use emailed token |
| POST | `/api/v1/auth/resend-verification` | Session | Limited to 1/min and 5/hour |
| GET | `/api/v1/audit-logs` | Session + School + Permission | `audit.view` (Director); filters `q`, `module`, `userId`, `from`, `to`, paging; read-only |
| GET/PATCH | `/api/v1/schools/me` | Session + School + Permission | `school.view` / `school.update`; profile, contact, address, regional, staff hours |
| GET/POST/DELETE | `/api/v1/schools/me/logo` | Session + School (+ `school.update` to change) | PNG/JPEG ≤ 1 MB; any member may fetch it |
| GET/PATCH | `/api/v1/school-settings` | Session + School + Permission | `school.view` / `school.update`; timings, working days, attendance, fee, notification, document rules |
| GET/PUT | `/api/v1/grading` | Session + School + Permission | `school.view` / `school.update`; `GET /grading/preview?percent=` |
| GET | `/api/v1/calendar?from&to` | Session + School + Permission | `holiday.view`; ≤ 100 days; working/off reason per day, terms, years |
| GET/POST/PATCH/DELETE | `/api/v1/academic-years/:id/terms…` | Session + School + Permission | `academicYear.view` / `.update` |
| GET/POST/PATCH/DELETE | `/api/v1/departments…` | Session + School + Permission | `department.view` / `.create` / `.update` |
| GET/POST/PATCH/DELETE | `/api/v1/groups…`, `/groups/:id/members…`, `GET /groups/student/:studentId` | Session + School + Permission | `group.view` / `.create` / `.update`; the student route follows `student.view` scope |
| GET | `/api/v1/documents/config` | Session + School + Permission | `document.view`; what the school accepts |
| GET | `/api/v1/students/:id` | Session + School + Permission | `student.view`; scope-checked against the specific student. Phase 4 demonstration endpoint only — see note below |

"Session" means `AuthGuard` only (user-level validity). "Session +
School" adds `SchoolContextGuard` (re-verifies active membership).
"Session + School + Permission" adds `PermissionGuard` +
`@RequirePermission(...)` (resolves the role's grant and scope) — the
full pipeline from `docs/authorization.md` §2, with the final
resource-level check (`authorizeResource`) made explicitly by the
handler.

`GET /students/:id` is deliberately the *only* Students endpoint right
now — a minimal, real, permission-gated resource built specifically to
prove the Phase 4 authorization pipeline end-to-end (not a Students CRUD
module; that's its own later phase per `docs/modules.md`). There is
still no `POST /api/v1/auth/invitations` (admin-creates-invite) endpoint
for the same reason invitations were deferred in Phase 3: it's
permission-gated (`user.create`) and belongs alongside a real
School/User management module, not bolted onto Auth or Students. As
each further module ships, its endpoints are appended to this table
with method, path, required permission, and scope — not written
speculatively ahead of the implementation.

## 8. What This Endpoint Contract Does Not Replace

Authorization (which permission/scope a route requires) is documented
per-route in code via the `@RequirePermission(...)` decorator
(`docs/authorization.md` §2), which is the source of truth; this
document's endpoint table references the permission key for
discoverability but the decorator is authoritative if they ever
disagree — a discrepancy is a bug in this doc, not in the code.
