# Schovexa — Product Requirements

Status: Phase 0 (Product Definition) — draft for architecture validation
Owner: Utkarsh Kumar Singh (Founder)

## 1. Product Summary

Schovexa is a multi-tenant School ERP SaaS platform. One codebase, one
deployment, serving many independent schools. Each school's data,
configuration, and users are logically isolated from every other school.

Tagline: **Smart Schools. Better Futures.**
Core principle: **Build Once. Configure Per School. Serve Many Schools.**

## 2. Target Users

Primary customer: the school (management/owner), not the individual student.

| Persona | Primary needs |
|---|---|
| Director / Owner | Oversight, fee collection, staff, growth |
| Principal / Vice Principal | Academics, attendance, approvals |
| School Administrator | User & records management, configuration |
| Academic Coordinator | Curriculum, exams, results review |
| Accountant | Fees, payments, receipts, refunds |
| Teacher / Class Teacher | Attendance, homework, marks, own classes |
| Receptionist | Admissions, front-desk records |
| Parent | Own child's attendance, fees, results, notices |
| Student | Own timetable, attendance, homework, results |
| Platform Super Admin | Cross-school administration, billing, support |

## 3. Product Scope

In scope for the product (all phases): tenant/school management, auth,
RBAC + permission scopes, student/parent/teacher management, academics
(years/classes/sections/subjects), attendance, timetable, admissions,
fees/payments/receipts, exams/results, homework, notices/notifications,
documents, leave, library, inventory, transport, events, complaints,
reports/analytics, audit logs, subscriptions/entitlements, platform admin.

Out of scope until explicitly requested: native mobile apps, payroll
processing (only architecture), AI features beyond assistive drafting,
white-labeling / custom domains (architecture must not block these later).

## 4. MVP Definition (Phase 1 build target)

MVP must be a coherent, demoable, secure slice — not a partial version of
every module. It includes:

- Core platform: auth, multi-tenancy, school onboarding, users,
  memberships, roles, permissions, school settings, audit logs
- Student management: students, parents, parent-child linking, admission
  records, documents, student status
- Academics: academic years, classes, sections, subjects, teacher
  assignments
- Attendance: daily/class attendance, history, reports
- Fees: categories, structures, student fee assignment, payments
  (manual/offline first), receipts, outstanding balance, basic reports
- Communication: notices, in-app notifications
- Reporting: role-appropriate dashboards, student/attendance/fee reports

Explicitly deferred past MVP: exams/results, online payment gateway,
homework, leave management, library, inventory, transport, WhatsApp/SMS,
approval workflows beyond a minimal fee/result stub, data import tooling.
See `docs/modules.md` for the full phase breakdown.

## 5. Tenant Boundaries

A "tenant" is a School. Every school-owned record must resolve back to a
`schoolId` via server-derived context (the authenticated user's verified
`SchoolMembership`), never a client-supplied value. Cross-tenant access is
a security defect, not an edge case — it must be prevented by
construction (shared authorization layer) and verified by automated tests
before any release. See `docs/architecture.md` §Multi-Tenancy and
`docs/permissions.md`.

Platform Admin operates outside all tenant boundaries but has no implicit
per-school data access — platform-to-school access must be explicit and
audited.

## 6. Core Business Rules

1. A user authenticates once; their accessible schools come from their
   `SchoolMembership` records, not from client input.
2. A user's active-tenant selection is stored server-side (session) once
   established, not re-derived from request parameters per call.
3. Permissions are `module.action` strings with a `scope` — never
   role-name string checks in business logic.
4. Financial and result-publishing actions are transactional and audited;
   partial states are not acceptable (e.g. payment recorded without
   receipt).
5. Historical/financial/audit records are soft-deleted or immutable, never
   hard-deleted by ordinary users.
6. Schools configure structure (class counts, grading scheme, fee
   structure) via data, not code changes.
7. No module is "free" from tenant + permission enforcement, including
   reports and search.

## 7. Main Workflows (MVP)

- **School onboarding**: platform admin or self-serve creates School →
  school info/branding → academic year → classes/sections/subjects →
  first admin user (Director/Principal) → default roles seeded →
  invite staff.
- **Staff invite**: admin invites a user by email → invitation token →
  user accepts → account ACTIVE → membership + role assigned.
- **Student admission**: admin/receptionist creates student record →
  links parent(s) → assigns class/section → status ENROLLED.
- **Daily attendance**: teacher marks attendance for an assigned
  class/section → visible to principal (all) and parents (own child).
- **Fee collection**: accountant records a payment against a student fee
  assignment → receipt generated → audit entry → parent notified.
- **Notices**: admin/teacher publishes a notice scoped to school, class,
  or individual → recipients see in-app notification.

## 8. Non-Functional Requirements

- Security and tenant isolation take priority over feature velocity
  (see Critical Engineering Rules in the master brief — treated as
  binding for this project).
- All server-side authorization decisions must be centralized and
  reusable, not duplicated per controller.
- P95 API latency target (MVP, non-report endpoints): < 300ms under
  expected small-school load (≤2,000 students/school).
- Reports and imports/exports must not block the HTTP request thread for
  large datasets — background jobs from Phase 2 onward; MVP reports are
  bounded/paginated to stay synchronous-safe.
- Every sensitive action (auth, user/role/permission changes, financial
  transactions, result publishing, exports, config changes) is audit
  logged with actor, tenant, resource, and timestamp — never with
  secrets in the payload.

## 9. Open Questions / Architectural Risks to Resolve Before Phase 1

These need an explicit decision (flagging per the "STOP and validate"
requirement) before database/auth implementation begins:

1. **Payments in MVP**: Master brief lists Fees/Payments in MVP but full
   gateway integration (Razorpay/Cashfree, webhooks) in Phase 2. Proposed:
   MVP supports fee structures + manually recorded payments/receipts;
   gateway integration and online payment status verification is Phase 2.
2. **Object storage for documents**: MVP needs *some* document storage
   (student documents). Proposed: S3-compatible storage (e.g. AWS S3 or
   Cloudflare R2) from day one, even in MVP, to avoid a later data
   migration off Postgres BLOBs.
   Requires: which provider/account to provision.
3. **Deployment target**: brief allows AWS/Vercel/other. Needs a decision
   before Phase 15 (infrastructure) — does not block Phases 0–2.
4. **Multi-membership UI**: schema supports a user belonging to multiple
   schools (future), but MVP UI can assume one active school per session
   with a switcher stubbed for later. Confirm this is acceptable for MVP.
5. **Company/legal**: Schovexa is a working brand name — trademark and
   domain availability have not been verified. Does not block engineering
   work, but should not be treated as final before public launch or
   registration.
6. **MVP deployment shape** (single API instance vs. scaled from day
   one): determines whether login/reset rate limiting needs a
   Redis-backed shared store in MVP or can start with a simpler
   in-process limiter. Raised by the Step 5 security/scalability review
   (`docs/security-scalability-review.md`, finding F3).

These are called out explicitly rather than silently decided, per the
change-management rule in the engineering brief.
