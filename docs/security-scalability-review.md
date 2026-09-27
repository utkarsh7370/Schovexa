# Schovexa — Security & Scalability Design Review

Status: Step 5 deliverable. This is a design-level review of Steps 1–4
(`docs/database.md`, `docs/authentication.md`, `docs/authorization.md`,
`docs/multi-tenancy.md`) — performed before any code exists. It is not
the Phase 13 security audit (which reviews actual implemented code); it
exists to catch architectural conflicts now, when they cost a paragraph
edit instead of a migration. Each finding is closed by fixing the design
document in place; none are left open into implementation.

Format follows the brief's audit template: Issue / Severity / Area /
Risk / Fix / Status.

## Findings

### F1 — Unique constraints conflict with soft deletion
- **Severity**: High
- **Area**: Database design (`docs/database.md`)
- **Risk**: `User.email @unique`, `Student @@unique([schoolId, admissionNo])`,
  `SchoolMembership @@unique([userId, schoolId])`, and `Role @@unique([schoolId, name])`
  are all plain unique constraints on tables that also carry `deletedAt`.
  As written, a soft-deleted row still occupies its unique slot: a
  disabled user's email can never be reinvited, a withdrawn student's
  admission number can never be reissued, a former staff member
  re-hired at the same school cannot get a new `SchoolMembership`, and a
  deleted custom role's name cannot be reused. This would surface as a
  confusing "already exists" error in production with no clean
  workaround.
- **Fix**: Use partial/filtered unique indexes scoped to `deletedAt IS
  NULL` (Postgres supports this; Prisma expresses it via a raw SQL
  migration alongside the generated schema, since `@@unique` alone
  cannot express a `WHERE` clause). Applies to: `User.email`,
  `Student(schoolId, admissionNo)`, `SchoolMembership(userId, schoolId)`,
  `Role(schoolId, name)`, `AcademicYear(schoolId, name)`,
  `Class(academicYearId, name)`, `Section(classId, name)`,
  `Subject(schoolId, name)`, `Teacher(schoolId, userId)`,
  `FeeCategory(schoolId, name)`. Documented here as a required amendment
  to `docs/database.md`; the actual partial-index migration is written
  at Step 6 implementation time.
- **Status**: **Resolved at design level** — `docs/database.md` is
  amended (see §2 below) to call this out explicitly so it is not missed
  during schema implementation.

### F2 — Session fixation not addressed
- **Severity**: Medium
- **Area**: Authentication (`docs/authentication.md` §2)
- **Risk**: The design does not state that the session identifier is
  regenerated on successful login. If a session ID could be set/observed
  before authentication (e.g. via a pre-auth session cookie used for
  CSRF-token issuance) and reused after, this is a session-fixation
  vector.
- **Fix**: On successful password verification, always issue a *new*
  session ID (rotate), invalidate any pre-auth session, and set the
  cookie fresh. This is added as an explicit rule in
  `docs/authentication.md` §2.
- **Status**: **Resolved** — see amendment below.

### F3 — In-memory rate limiting does not survive horizontal scaling
- **Severity**: Medium
- **Area**: Authentication (`docs/authentication.md` §4), Scalability
- **Risk**: If login/reset rate limiting is implemented with an
  in-process store (the default for some NestJS throttler setups), it
  only limits per-instance. Once the API runs behind a load balancer
  with more than one instance, an attacker's requests spread across
  instances and the effective limit multiplies by instance count.
- **Fix**: Rate limiting must be backed by a shared store (Redis) from
  the point the API runs more than one instance — which, given Redis is
  already planned for BullMQ (`docs/architecture.md` §11), is not a new
  piece of infrastructure, just an earlier use of it than originally
  scoped. Flagged as a requirement for MVP if MVP deploys with >1 API
  instance; acceptable to defer to Phase 2 only if MVP explicitly runs a
  single instance — this is a deployment decision, not a code one, and
  is added to the open questions in `docs/product-requirements.md`.
- **Status**: **Resolved (conditional)** — depends on the MVP
  single-instance-vs-scaled deployment decision, tracked as an open
  question rather than silently assumed.

### F4 — Notification fan-out write pattern doesn't scale to large audiences
- **Severity**: Medium
- **Area**: Database design (`docs/database.md` §8), Scalability
- **Risk**: `Notification` is modeled as one row per `(user, notice)`.
  For an `ALL_SCHOOL` notice at a 2,000-student school, publishing
  creates ~2,000+ rows synchronously in the publish request, and marking
  "read" only updates one row at a time. This is a write-amplification
  and request-latency problem, exactly the kind of "background job, not
  synchronous request" case the brief calls out generally
  (`docs/architecture.md` §11) but this specific instance wasn't named.
- **Fix**: (a) Notice publishing to broad audiences is moved to a
  background job (fits the existing Phase 2 BullMQ plan, just naming
  this as one of its first consumers), and (b) for `ALL_SCHOOL`/`CLASS`/
  `SECTION` audience types, read state can be tracked more cheaply via a
  small `NoticeRead(noticeId, userId, readAt)` table populated lazily
  (only on first read) instead of pre-creating a `Notification` row for
  every recipient up front. `INDIVIDUAL`-audience notices and other
  triggered notifications (fee paid, etc.) remain one-row-per-recipient
  since their audience is naturally small. This refines
  `docs/database.md` §8 rather than replacing it wholesale.
- **Status**: **Resolved** — noted as a required refinement before
  Notice/Notification tables are actually migrated in Step 6.

### F5 — Password reset/invite token hashing algorithm unspecified
- **Severity**: Low
- **Area**: Authentication (`docs/authentication.md` §4–6)
- **Risk**: The design says tokens are "stored hashed," matching
  password hashing terminology, but a slow password-hashing algorithm
  (Argon2id) is unnecessary and wasteful for a high-entropy random
  token (unlike passwords, these aren't user-chosen/guessable) — using
  it would just slow down every reset-token verification for no security
  benefit, since the token's security comes from its entropy, not from
  hashing cost.
- **Fix**: Reset/invite/verification tokens use a fast cryptographic
  hash (e.g. SHA-256) of a high-entropy random value (e.g. 32 bytes from
  a CSPRNG); only the hash is stored, the raw token is only ever in the
  emailed link. This distinction is added to `docs/authentication.md`.
- **Status**: **Resolved** — see amendment below.

### F6 — CORS/cookie behavior across web/api subdomains not specified
- **Severity**: Low
- **Area**: Multi-tenancy / Authentication cross-cutting
- **Risk**: `docs/authentication.md` specifies `SameSite=Lax` cookies but
  doesn't state the CORS configuration needed if `apps/web` and
  `apps/api` are served from different subdomains (e.g.
  `app.schovexa.com` and `api.schovexa.com`). Without `credentials:
  'include'` on the frontend and a matching `Access-Control-Allow-
  Credentials: true` + explicit (non-wildcard) `Access-Control-Allow-
  Origin` on the API, cross-subdomain cookie auth silently fails or, if
  misconfigured with a wildcard origin, becomes a CSRF/data-leak risk.
- **Fix**: API CORS config uses an explicit allow-list of known frontend
  origins (never `*` when credentials are allowed), and this is called
  out as a required Phase 15/implementation configuration item, not left
  implicit.
- **Status**: **Resolved** — tracked as an explicit requirement, added to
  `docs/architecture.md` §13 scope at implementation time.

### F7 — Connection pool exhaustion risk not addressed for deployment
- **Severity**: Medium (scalability, not security)
- **Area**: Architecture (`docs/architecture.md` §1, §15), Database
- **Risk**: Prisma/Postgres connection pooling is a known failure mode
  if the API is deployed as short-lived serverless functions (each
  invocation potentially opening its own pool) — this can exhaust
  Postgres's max connections well before real user load is high.
- **Fix**: Whichever deployment target is chosen (open question in
  `docs/product-requirements.md` §9), a connection pooler (PgBouncer, or
  a managed equivalent like Prisma Accelerate / RDS Proxy / Supabase's
  pooler) sits between the API and Postgres if the API is not a small,
  fixed number of long-running processes. Recorded as a Phase 15
  infrastructure requirement, not a blocker for Steps 2–5.
- **Status**: **Resolved (deferred, tracked)** — added to
  `docs/architecture.md` §15 as a stated requirement rather than an
  assumption.

### F8 — AuditLog unbounded growth
- **Severity**: Low (scalability, long-term)
- **Area**: Database design (`docs/database.md` §9)
- **Risk**: `AuditLog` is append-only and indexed, but has no stated
  retention/partitioning strategy. At scale (many schools, years of
  operation) this table grows indefinitely and query/index performance
  degrades gracefully but eventually needs attention.
- **Fix**: Not an MVP concern — explicitly deferred to Phase 15
  (`docs/architecture.md` §13, backup/retention docs) where a retention
  policy and possibly table partitioning by month/`schoolId` is defined.
  Recorded here so it isn't forgotten, not because it needs solving now.
- **Status**: **Acknowledged, deferred** (correctly out of scope for
  Steps 2–5).

### F9 — Scope-resolution queries add per-request DB round trips
- **Severity**: Low
- **Area**: Authorization (`docs/authorization.md` §3), Performance
- **Risk**: Each `OWN_CLASS`/`OWN_SUBJECT`/`OWN_CHILDREN` scope check is
  a DB query. For single-resource endpoints this is negligible; for
  list/report endpoints, naively calling `authorize()` per row would be
  an N+1 pattern.
- **Fix**: Already correctly addressed for the list/report/search case
  in `docs/multi-tenancy.md` §7 (scope filter pushed into the query
  itself, not checked per row after fetching) — this finding confirms
  that guidance is sufficient and flags it as a point implementers must
  not regress on when writing list endpoints in Step 6.
- **Status**: **No design change needed** — confirmed covered;
  called out here so it's explicitly verified in code review at
  implementation time.

## Summary Table

| # | Issue | Severity | Status |
|---|---|---|---|
| F1 | Unique constraints vs. soft delete | High | Resolved (design amended) |
| F2 | Session fixation | Medium | Resolved (design amended) |
| F3 | Rate limiting needs shared store at scale | Medium | Resolved, conditional on deployment shape |
| F4 | Notification fan-out doesn't scale | Medium | Resolved (design amended) |
| F5 | Token hashing algorithm unspecified | Low | Resolved (design amended) |
| F6 | CORS/cookie cross-subdomain behavior | Low | Resolved (tracked requirement) |
| F7 | Connection pool exhaustion risk | Medium | Resolved, deferred to Phase 15 |
| F8 | AuditLog unbounded growth | Low | Acknowledged, deferred |
| F9 | Scope-resolution N+1 risk on lists | Low | No change needed, confirmed covered |

No **Critical** findings — nothing here represents an unsafe design to
begin implementing against, but F1 in particular would have caused real
production bugs (silent "already exists" errors on reissued admission
numbers / re-invited staff) had it not been caught before the schema was
implemented.

## Amendments Applied to Prior Documents

The following documents are updated as a direct result of this review
(applied in this same change, not left as follow-up TODOs):

- `docs/database.md` — §11 (Cascade & Deletion Policy) gains a note on
  partial unique indexes for soft-deleted tables (F1); §8 gains the
  `NoticeRead` refinement (F4).
- `docs/authentication.md` — §2 gains session-ID rotation on login (F2);
  §4/§6 clarify token hashing uses a fast hash, not Argon2id (F5).
- `docs/architecture.md` — §13/§15 gain explicit CORS allow-list and
  connection-pooling requirements (F6, F7).

## Architectural Conflicts Requiring Your Sign-Off

None of the above are open design disagreements — all nine are resolved
within this document and applied to the referenced docs. The only items
still requiring your input are the pre-existing open questions in
`docs/product-requirements.md` §9, now joined by:

6. **MVP deployment shape** (single instance vs. scaled from day one) —
   determines whether F3 (rate limiting) needs Redis in MVP or can use
   an in-process limiter initially.

## Step 5 Conclusion

Steps 2–4 are architecturally sound for proceeding to Step 6
(implementation), with the amendments above folded in. No blocking
conflicts remain. Implementation should still begin with the database
schema (Prisma) reflecting the F1 partial-unique-index fix from the
start, rather than as a later migration.
