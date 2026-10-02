# Schovexa — Authentication Design

> **Binding security rules:** see [`security-rules.md`](security-rules.md). Where this design document and that file differ (password policy, sessions, lockout, verification), `security-rules.md` is current.

Status: Step 3 design deliverable (authentication half). Implements the
identity side of `docs/architecture.md` §5. No code yet — this document
is the contract Phase (implementation Step 6, sub-phase "Authentication")
must satisfy, and what its tests are written against.

## 1. Credential Storage

- Password hashing: **Argon2id** (`argon2` package), parameters tuned at
  implementation time to target ~250-500ms verify time on production
  hardware (memory cost ≥ 19 MiB, iterations ≥ 2, parallelism ≥ 1, per
  OWASP guidance). Bcrypt (cost ≥ 12) is an acceptable fallback only if a
  concrete dependency constraint rules out Argon2id at implementation
  time — not a default choice.
- Passwords are never stored, logged, or returned in any API response,
  including error messages.
- Minimum password policy (enforced server-side, not just client-side):
  ≥ 10 characters, checked against a common-password blocklist
  (e.g. top 10k list) at signup/reset time. No forced periodic rotation
  (current best practice — rotation policies encourage weak variations).

## 2. Session Strategy

Server-side session, not a stateless long-lived JWT holding
authorization claims — chosen because:
- Sessions can be revoked immediately (disable user → session dead) —
  a pure JWT without a revocation list cannot do this cleanly.
- The active-school context changes rarely per session and benefits
  from a single source of truth server-side, not from being encoded into
  a token the client could attempt to tamper with.

Implementation shape:
- Opaque session ID stored in a cookie: `httpOnly`, `Secure`, `SameSite=Lax`
  (Lax, not Strict, so links from email/notices still work; CSRF is
  additionally mitigated per `docs/authorization.md` §7 and standard
  CSRF-token or double-submit-cookie protection on state-changing routes).
- Session record (Redis or a `Session` table) stores: `userId`,
  `activeMembershipId` (nullable until a school is selected),
  `createdAt`, `expiresAt`, `lastSeenAt`.
- Session TTL: sliding expiration, e.g. 12 hours of inactivity, hard cap
  7 days — exact values confirmed at implementation time, not
  load-bearing for this design.
- Logout deletes the session record server-side (not just the cookie) —
  a stolen cookie after logout must be dead.
- **Session rotation on login**: a new session ID is always issued on
  successful authentication, and any pre-existing (e.g. anonymous/pre-auth)
  session for that cookie is invalidated. This prevents session
  fixation — an attacker cannot pre-set a session identifier and have it
  become authenticated once the victim logs in.
- A disabled/suspended/deleted `User`, or a membership moved to
  `SUSPENDED`/`DISABLED`, must be checked on every request that relies on
  that membership (see the tenant-resolution pipeline in
  `docs/multi-tenancy.md`) — not only at login time. A long-lived session
  from a user disabled mid-session must stop working on the next request,
  not at next login.

## 3. Endpoints (design-level, exact paths finalized in `docs/api.md`)

```
POST   /api/v1/auth/login              email + password -> session cookie
POST   /api/v1/auth/logout             destroys session
POST   /api/v1/auth/forgot-password    email -> sends reset link (always 200, no user enumeration)
POST   /api/v1/auth/reset-password     token + new password
POST   /api/v1/auth/accept-invite      invite token + password -> activates INVITED user
GET    /api/v1/auth/me                 current user + memberships (no schoolId trusted from client)
POST   /api/v1/auth/select-school      membershipId -> sets activeMembershipId on session (re-validated server-side)
```

`POST /auth/verify-email` as a standalone endpoint was not implemented:
the only provisioning path that exists (invite-based) already proves
email ownership at `accept-invite` time (§8), so a separate verification
step has nothing to do yet. It is added back when a self-serve
registration flow (§3 above, Phase 2/admissions) actually needs it,
rather than built ahead of that need.

No public self-registration endpoint in MVP — school staff accounts are
always created via `accept-invite` (see §5). A future parent/student
self-registration flow (Phase 2, tied to admissions) is a distinct,
separately designed flow, not an extension of staff login.

## 4. Rate Limiting & Brute-Force Protection

*Current behaviour:* 5 failed sign-ins per email per 15 minutes locks the
email (30 per IP), whether or not the email exists, tracked in the
`LoginAttempt` table; sessions last 7 days (90 with "Keep me signed in") at
most; sensitive actions need a password confirmation within 10 minutes.
Details and tests: [`security-rules.md`](security-rules.md) §3–§4.

- `login`: rate-limited per IP and per email (e.g. 5 attempts / 15 min
  per email, exponential backoff or temporary lock after repeated
  failures) — implemented at the API layer (e.g. `@nestjs/throttler` or
  equivalent), not left to infrastructure alone.
- `forgot-password`: rate-limited per IP and per email to prevent reset
  spam / enumeration probing; response is identical (200, generic
  message) whether or not the email exists.
- Failed login attempts are logged (email attempted, IP, timestamp) but
  **never** the attempted password.
- Reset and invite tokens: single-use, short-lived (e.g. 1 hour for
  reset, 7 days for invite), stored hashed (not plaintext) in the
  database, invalidated on use or on issuance of a newer token for the
  same purpose. These tokens are hashed with a **fast** cryptographic
  hash (e.g. SHA-256) of a high-entropy CSPRNG-generated value (≥32
  random bytes) — not Argon2id/bcrypt. Slow password-hashing algorithms
  exist to defend against guessing a low-entropy, human-chosen secret;
  a random token's security comes entirely from its entropy, so a slow
  hash only adds needless verification latency with no security benefit.

## 5. Invitation Flow (primary provisioning path for staff)

```
Admin creates invitation (email + role + school)
        ↓
User record created with status = INVITED (or reused if email exists)
        ↓
SchoolMembership created (status = ACTIVE, but login blocked until user activates)
        ↓
Invite email sent with single-use token (not the password)
        ↓
Invitee opens link → sets password → emailVerifiedAt set → User.status = ACTIVE
        ↓
Can now log in
```

If the invited email already belongs to an existing `User` (future
multi-school membership case), no new `User` is created — a new
`SchoolMembership` is added to the existing user and an in-app/email
notice informs them of the new school access, without a password reset.

## 6. Password Reset Flow

```
User requests reset (email)
        ↓
Always respond 200 generically (no enumeration)
        ↓
If email exists: generate single-use token, store hash, email link
        ↓
User submits token + new password
        ↓
Verify token (exists, unexpired, unused, hash matches)
        ↓
Update passwordHash, invalidate all other active sessions for that user
        ↓
Audit log: "auth.password_reset" (no token/password in metadata)
```

Invalidating other sessions on reset prevents a scenario where an
attacker who already has a session survives the victim's own reset.

## 7. Account States & Login Eligibility

| State | Login allowed? |
|---|---|
| `INVITED` | No |
| `ACTIVE` | Yes |
| `SUSPENDED` | No |
| `DISABLED` | No |
| `DELETED` | No |

Every "No" row above produces the exact same login error as a wrong
password or an unknown email — one single generic message, not a
per-state variant. Message differences are themselves a user-enumeration
channel, so "wrong password," "no such user," and every non-ACTIVE
status must be indistinguishable to the caller; the specific reason is
available to admins via the user's status field, never via the login
error.

## 8. Email Verification

- Implemented. Registration emails a verification link (`EMAIL_VERIFICATION`
  token: single-use, hashed at rest, 24 h). `POST /auth/verify-email`
  consumes it; `POST /auth/resend-verification` sends a fresh one (retiring
  earlier links; 1/minute and 5/hour per account).
- Accepting an invitation, or completing a password reset from an emailed
  link, also marks the email verified — both prove ownership of the inbox.
- Whether an unverified email blocks sensitive actions is controlled by
  `REQUIRE_EMAIL_VERIFICATION` (default: on in production, off elsewhere).
  Everyday work is never blocked; the dashboard shows a banner with a
  "Resend link" button until the address is confirmed.

## 9. Future-Ready, Not Built in MVP

- **MFA**: session/auth service is designed so a second factor can be
  inserted between "password verified" and "session created" without
  restructuring the session model (e.g. an intermediate
  `mfaPending` session state). Not implemented in MVP.
- **OAuth (Google/Microsoft school SSO)**: would attach to the same
  `User` record via a future `AuthIdentity` table (`provider`,
  `providerUserId`, `userId`) rather than replacing password auth —
  not implemented in MVP, but the `User` model's password fields are
  already optional-shaped enough not to block this (a `passwordHash`
  could become nullable when an OAuth-only account is introduced).

## 10. Logging Rules (binding)

Never logged, at any log level, in any environment: plaintext passwords,
password hashes, reset/invite/verification tokens (plain or hashed),
session identifiers, API keys, payment gateway secrets. Structured logs
may include: user id, email (for audit trail), IP, user agent, outcome
(success/failure), timestamp.

## 11. Testing Requirements for This Design (Step 6 will implement these)

- Login succeeds only for `ACTIVE` users with correct credentials.
- Login fails identically (message + status code) for wrong password,
  unknown email, and non-active states.
- Session dies immediately when the user is disabled mid-session (not
  just at next login).
- Reset token is single-use: a second use of the same token fails.
- Rate limiting triggers after the configured threshold and is
  per-email/per-IP, not global.
- No password, hash, or token ever appears in a captured log line
  (verified by a log-scanning test in CI, not manual review alone).
