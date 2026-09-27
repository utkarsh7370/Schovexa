# Schovexa — System Architecture

Status: Phase 0/1 draft, for validation before database and code
implementation begin (per the mandated STOP-and-validate gate).

## 1. Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js + TypeScript + React + Tailwind | SSR/streaming where useful, large ecosystem, strong DX |
| Frontend data | TanStack Query + React Hook Form + Zod | Server-state caching, form/validation without hand-rolled state |
| Backend | NestJS + TypeScript | Modular DI-based architecture maps cleanly to the module list; avoids one giant service |
| API style | REST, versioned (`/api/v1/...`) | Simple, well-understood, easy to document; GraphQL not justified at this stage |
| Database | PostgreSQL | Relational integrity is essential for tenant isolation, FKs, financial data |
| ORM | Prisma | Type-safe schema, migrations, works well with NestJS |
| File storage | S3-compatible object storage | Files do not belong in Postgres; signed URLs for access control |
| Cache/Queue | Redis + BullMQ | Background jobs (email, reports, imports) — introduced when Phase 1 needs its first async job, not before |
| Monorepo | apps/web, apps/api, packages/{ui,types,validation,config} | Shared types/validation between frontend and backend without duplication |

No new dependency is added without a stated reason (Critical Rule 14).

## 2. Repository Layout

```
schovexa/
├── apps/
│   ├── web/            Next.js app
│   └── api/             NestJS app (modules per docs/modules.md)
├── packages/
│   ├── ui/               shared design-system components
│   ├── config/            shared config (eslint, tsconfig, etc.)
│   ├── types/             shared TS types/interfaces
│   ├── validation/         shared Zod schemas
│   └── utils/
├── docs/                  this documentation set
├── infrastructure/        IaC / deployment config (Phase 15)
├── scripts/
├── tests/                 cross-cutting integration/E2E tests
├── .env.example
├── docker-compose.yml
└── package.json
```

## 3. Multi-Tenancy Architecture

Logical multi-tenancy: one database, one schema, every school-owned table
carries a `schoolId` foreign key. No schema-per-tenant, no
database-per-tenant — unnecessary operational complexity at this scale,
and Postgres row-level isolation via enforced `schoolId` filtering plus
strict server-side authorization is sufficient and simpler to operate,
back up, and migrate.

```
Platform
   ├── School A ── Users, Students, Teachers, Parents, Fees, Attendance, Exams
   └── School B ── Users, Students, Teachers, Parents, Fees, Attendance, Exams
```

**Non-negotiable rule**: `schoolId` used in any query is *derived from the
authenticated user's verified membership/session context*, never read
directly from client-supplied input (body/query/params). A request that
includes a `schoolId` the user does not have an active membership for is
rejected at the authorization layer before any data access.

### Tenant Resolution Pipeline

Every protected request follows:

```
Request
  → Authenticate (verify session/JWT)
  → Load User
  → Load active SchoolMembership (school context)
  → Verify membership is ACTIVE
  → Verify permission (module.action) via role
  → Resolve permission scope
  → Verify resource ownership against scope (e.g. resourceId belongs to schoolId / OWN_CLASS / OWN_CHILDREN)
  → Execute handler
  → Audit log if sensitive
```

This is implemented once as a NestJS guard + interceptor pair (an
`AuthGuard` for authentication, a `PermissionGuard`/`authorize()` service
for steps 3–6), applied via decorators on controllers/handlers — never
reimplemented per module.

## 4. Identity Architecture

```
User (global identity: email, password hash, account state)
  └── SchoolMembership (userId, schoolId, roleId, membership status)
        └── School
        └── Role → RolePermission → Permission (+ scope)
```

A `User` is not tightly coupled to one school. `SchoolMembership` is the
join that allows a user to hold independent roles across multiple
schools in the future (e.g. a teacher at two schools) without a schema
change — MVP UI assumes a single active membership per session, with the
data model already supporting more.

Session/JWT carries `userId` and (once selected) `activeMembershipId` /
`schoolId`; switching schools re-validates membership server-side, it is
never a pure client-side toggle.

## 5. Authentication Architecture

- Credentials: email + password, hashed with Argon2id (bcrypt acceptable
  fallback if a dependency constraint requires it — Argon2id preferred).
- Session strategy: server-side sessions (or short-lived JWT + refresh
  token) with secure, httpOnly, SameSite cookies for the web app.
- Account states drive login eligibility: `INVITED` (must complete
  invite flow), `ACTIVE` (normal), `SUSPENDED`/`DISABLED` (login denied
  with a generic message), `DELETED` (login denied).
- Flows: invite-based provisioning (no public self-registration for
  school staff in MVP — accounts are created via invitation), login,
  logout, forgot/reset password, email verification.
- Rate limiting + brute-force protection on login and password-reset
  endpoints from day one (not deferred).
- MFA and OAuth: architecture leaves room (auth strategy abstraction) but
  is not implemented in MVP.
- Never logged: passwords, reset tokens, session tokens, API keys,
  payment secrets.

## 6. Authorization Architecture

See `docs/permissions.md` for the full permission/scope model. Enforcement
is centralized in a single authorization module used by every controller:

```ts
authorize({ permission, schoolId, resourceId?, scope });
```

Design constraints:
- No controller performs ad hoc `if (user.role === ...)` checks.
- Scope resolution (e.g. "is this class one the teacher is assigned to")
  lives in the relevant domain service, called by the shared
  authorization service — not copy-pasted per endpoint.
- Denial is a 403 (authenticated, not authorized) or 404 (to avoid
  confirming resource existence across tenants) as appropriate — decided
  per endpoint, documented in `docs/api.md` once written.

## 7. Database Architecture (high level)

Full ERD is Phase 2 of the implementation plan (`docs/database.md`, not
yet written). Core entities anticipated, per the master brief:

```
User, School, SchoolMembership, Role, Permission, RolePermission,
AcademicYear, Class, Section, Subject, Teacher, Student, Parent,
StudentParent, Attendance, FeeCategory, FeeStructure, StudentFee,
Payment, Receipt, Notice, Notification, AuditLog, Subscription,
Feature, SchoolFeature, Document
```

Principles:
- Every school-owned table has a non-null `schoolId` FK (except global
  platform tables: `User`, `Subscription`/`Plan` catalog, `Feature`
  catalog).
- Indexes anticipated on `schoolId`, `userId`, `studentId`, `classId`,
  `sectionId`, `academicYearId`, `createdAt`, `status` — added based on
  actual query patterns, not blindly on every column.
- Soft deletion (`deletedAt`) on: User, Student, Teacher, Fee/Payment
  records, academic structures. Hard delete only for genuinely
  disposable data (e.g. expired sessions).
- Financial operations (payment + receipt, fee refund) and multi-step
  writes (role update + permission changes, bulk import, result
  publishing) run inside a single database transaction.

## 8. File Storage Architecture

- S3-compatible object storage (provider decision open — see
  `docs/product-requirements.md` §9).
- Uploads go through the API (validated for type/size), which issues
  signed PUT URLs or proxies the upload; downloads use time-limited
  signed URLs — no permanently public URLs for student/staff documents.
- Every `Document` record carries `schoolId` + owner metadata; access is
  authorized the same way any other resource is (permission + scope),
  before a signed URL is issued.

## 9. Notification Architecture

Centralized notification service, triggered by domain events (e.g.
`FeePaidEvent`, `AttendanceMarkedEvent`), fanning out to channels:

```
Domain Event → NotificationService → { In-App, Email, SMS, WhatsApp }
```

Business modules emit events; they never call a specific channel
provider (e.g. Twilio, an email SDK) directly. MVP implements the
in-app channel; Email/SMS/WhatsApp adapters are added in Phase 2 behind
the same interface. Templates are stored per school (configurable), not
hardcoded strings.

## 10. Payment Architecture (Phase 2, designed for now)

```
PaymentService
  ├── RazorpayAdapter
  └── CashfreeAdapter
```

Flow: create order → redirect to gateway → gateway callback/webhook →
verify signature server-side → update Payment record → generate Receipt
→ audit → notify. Frontend-reported payment status is never trusted;
success is only recorded after server-side signature verification.
Webhook handling is idempotent (dedupe by gateway event id).

## 11. Background Jobs

Redis + BullMQ, introduced when the first genuinely async need lands
(likely: email delivery or CSV import in Phase 2) rather than
provisioned speculatively in MVP if nothing yet needs it. Candidates:
emails, SMS/WhatsApp dispatch, large report generation, imports/exports,
scheduled jobs.

## 12. Subscription / Entitlement Architecture

```
School → Subscription → Plan → FeatureEntitlement → Module Access
```

Feature access (e.g. "does this school's plan include WhatsApp
notifications") is enforced server-side in the same authorization path,
not by hiding a frontend menu item. Usage limits (max students, max
staff, max storage) are validated server-side at the point of creation,
not only displayed in the UI.

## 13. Observability, Backups, Environments

- Structured logging (no secrets — see `docs/product-requirements.md`
  business rules), error monitoring (e.g. Sentry), health checks for API/
  DB/queue, uptime + performance monitoring — introduced starting Phase
  1 for logging/health checks; full alerting stack is a Phase 15
  (infrastructure) concern.
- Three environments: development, staging, production. Production
  secrets never in source control; `.env.example` holds placeholders
  only.
- **CORS**: the API uses an explicit allow-list of known frontend
  origins for `Access-Control-Allow-Origin` — never a wildcard — because
  session cookies are sent with `credentials: 'include'` across the
  web/api subdomains; a wildcard origin combined with credentialed
  requests is a data-leak risk, not just a misconfiguration.
- Automated, encrypted database backups with a documented, *tested*
  restore procedure before production launch (see `docs/backup.md`, to
  be written in Phase 15).

## 14. Testing & Security (binding for every phase)

Every phase's implementation is not "done" until:
- Unit tests (services, permission checks, validation, business rules)
- Integration tests (auth, DB ops, core workflows, permissions)
- E2E tests for critical user journeys
- **Explicit cross-tenant/authorization negative tests**, at minimum:

```
School A user      → School B student      (must fail)
School A admin      → School B fee          (must fail)
Teacher              → unauthorized class    (must fail)
Teacher              → unauthorized subject  (must fail)
Student              → another student       (must fail)
Parent               → another parent's child(must fail)
Accountant           → admin-only settings   (must fail)
School user          → platform administration(must fail)
Disabled user        → any protected API     (must fail)
Expired session      → any protected API     (must fail)
```

These are written as automated tests before a module is considered
complete, not as a manual checklist performed once.

## 15. Deployment Architecture (target shape, not built yet)

```
Internet → CDN/HTTPS → Next.js Web → API (NestJS) → { PostgreSQL, Redis, Object Storage }
                                                          └── Backups
```

Provider (AWS vs Vercel vs other) is an open decision (see
`docs/product-requirements.md` §9) that does not block Phases 0–2.

**Connection pooling requirement**: whatever the deployment target, if
the API is not a small fixed number of long-running processes (e.g. it
runs as short-lived serverless functions), a connection pooler
(PgBouncer, RDS Proxy, Prisma Accelerate, or the provider's managed
equivalent) sits between the API and Postgres. Prisma/Postgres
connections are not free-scaling; without a pooler, connection
exhaustion is a realistic production failure mode well before genuine
user-load limits are hit.

The architecture must not preclude future per-school subdomains
(`school-a.schovexa.com`) or custom domains — not implemented in MVP, but
not architecturally blocked either (routing/tenant-resolution already
derives tenant from authenticated membership, not from hostname, so
hostname-based routing can be layered on later without a rewrite).

## 16. Phase 1 Design Set — Status

Phase 1 (System Architecture) is now fully designed across the
following documents, each covering the area named in the master brief's
Phase 1 scope:

| Area | Document |
|---|---|
| Application architecture | This document, §1–2 |
| Database architecture | `docs/database.md`, this document §7 |
| Authentication architecture | `docs/authentication.md` |
| Authorization architecture | `docs/authorization.md` |
| Multi-tenant architecture | `docs/multi-tenancy.md`, this document §3–4 |
| API architecture | `docs/api.md` |
| Frontend architecture | `docs/frontend-architecture.md` |
| File storage architecture | This document, §8 |
| Notification architecture | This document, §9; `docs/database.md` §8 |
| Payment architecture | This document, §10 |
| Queue architecture | This document, §11 |
| Logging architecture | `docs/logging.md` |
| Deployment architecture | This document, §15 |

Deliberately **not** written yet, because they belong to later phases,
not Phase 1, per the mandated development order:

- Security audit findings → `docs/security-audit.md` (Phase 13, reviews
  actual implemented code — distinct from the Step 5 design-level review
  already done in `docs/security-scalability-review.md`)
- Performance findings → `docs/performance.md` (Phase 14)
- Backup/restore runbook → `docs/backup.md` (Phase 15)

## 17. Validation Checklist — Phase 1 Complete

- [x] Product requirements reviewed (`docs/product-requirements.md`)
- [x] Roles reviewed (`docs/user-roles.md`)
- [x] Permission model reviewed (`docs/permissions.md`)
- [x] Module/phase plan reviewed (`docs/modules.md`)
- [x] Architecture reviewed (this document, plus `docs/database.md`,
      `docs/authentication.md`, `docs/authorization.md`,
      `docs/multi-tenancy.md`, `docs/api.md`,
      `docs/frontend-architecture.md`, `docs/logging.md`)
- [x] Design-level security & scalability review performed
      (`docs/security-scalability-review.md`, 0 Critical findings)
- [ ] Open questions in `docs/product-requirements.md` §9 answered —
      still open (payments-in-MVP, storage provider, deployment target,
      single-active-school assumption, trademark note, MVP deployment
      shape); none of them block continued implementation, since
      defaults for each are already stated and in use in the Foundation
      code (`apps/api`, `apps/web`) — they are decisions to confirm or
      override, not gates.

Phase 1 (System Architecture) is complete. Implementation continues per
`docs/modules.md`'s phase order: Foundation (done) → Database → Auth →
Multi-tenancy → RBAC → ...
- [ ] Explicit go-ahead to begin Phase 2 (database schema design)

Per the mandated process, implementation (starting with the Prisma
schema) does not begin until this checklist is confirmed.
