# Schovexa — Security Rules

These are the rules every change to Schovexa must follow. Each rule says
**what** is required, **where** it is enforced, and **which test** proves
it. A pull request that breaks a rule must change the rule here, on
purpose, in the same PR.

Tests live in `apps/api/test/security.e2e-spec.ts` (through the real HTTP
stack) unless another file is named.

---

## 1. Who can create an account

| # | Rule | Enforced in |
|---|---|---|
| A1 | **Only a school owner signs up by themselves**, through `POST /schools/register`. That call creates one new school and one Director for it — nothing else. It can't be told to pick a role or join an existing school. | `schools.service.ts` |
| A2 | **Teachers, staff, students and parents never create their own account.** The school's authorities add them: staff and teachers are invited (`POST /memberships/invitations`), students are admitted by staff with `student.create`, parents are created by staff and invited from the parent profile (`POST /parents/:id/invite`). | `memberships.service.ts`, `parents.service.ts`, `students.service.ts` |
| A3 | The **only** public way into an existing school is an invitation token, which is single-use, hashed at rest, expires, and works only for an account that has no password yet. | `auth.service.ts` (`acceptInvite`) |
| A4 | An invitation **never lets anyone change the password of an account that already has one**. Inviting an existing, active account adds it to the school with no token and no link; a disabled or suspended account is refused. | `auth.service.ts` (`createInvitation`) |
| A5 | Emails are compared **case-insensitively** (stored lowercase), so `A@x.com` and `a@x.com` are one person. | `validation` (`apiEmail`), `auth.service.ts` |
| A6 | **You can only give others access you have yourself.** Inviting someone, changing their role, creating a role or editing one is refused if it would grant a permission you don't hold, or at a wider scope than yours. | `authorization.service.ts` (`assertCanGrant`, `assertCanAssignRole`) |
| A7 | **A school always has a Director.** The last active Director can't be disabled or demoted, and nobody can disable themselves. | `memberships.service.ts` |

Tests: *who can create an account*, *invitations cannot be used to take over an account*, *protecting the people in charge*.

## 2. Passwords

| # | Rule | Enforced in |
|---|---|---|
| P1 | Passwords are hashed with **Argon2id**. The plaintext is never stored, logged, audited or returned. | `auth.service.ts` |
| P2 | Policy, checked **on the server** wherever a password is set (register, accept invite, reset, change): 10–128 characters, not only spaces, not on the common-password list, not a trivial sequence (`aaaaaaaaaaaa`, `1234567890`), and must not contain the person's name or the part of their email before the `@`. The web forms apply a stricter version for guidance, but the server is the authority. | `validation` (`passwordSchema`), `auth.service.ts` (`assertPasswordAcceptable`) |
| P3 | **Forgot password** gives the same answer whether or not the email exists. **Reset** links are single-use and expire; requesting a new link retires the earlier ones. A reset signs the person out everywhere and lifts any sign-in lock. | `auth.service.ts` |
| P4 | Changing a password signs out every **other** device, keeps the current one, and emails the owner. | `auth.service.ts` (`changePassword`) |

Tests: *passwords*.

## 3. Sign-in, sessions and devices

| # | Rule | Enforced in |
|---|---|---|
| S1 | Sessions are **server-side**. The cookie holds a random token; the database holds only its SHA-256 hash. The cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production. | `auth.service.ts`, `auth.constants.ts` |
| S2 | **Login attempt protection:** 5 failed attempts for one email in 15 minutes locks that email (30 per IP). The lock applies **whether or not the email exists**, and the failure message is identical for wrong password, unknown email and disabled account, so it can't be used to find out who has an account. A successful sign-in clears the count. Stored in the database (`LoginAttempt`), so it holds across several API instances. | `auth.service.ts` (`assertNotLocked`) |
| S3 | **Keep me signed in:** a normal sign-in gets a browser-session cookie; a remembered one gets a 30-day cookie. Either way the server caps a session's total life — **7 days, or 90 when remembered** — however active the person is. Idle sessions slide forward only within that cap. | `auth.service.ts` (`validateSession`) |
| S4 | **Devices:** each session records its browser, OS and IP. People can list them (`GET /auth/sessions`), sign out any one (`DELETE /auth/sessions/:id`) or all others (`POST /auth/sessions/revoke-others`). A session id belonging to someone else is simply "not found". | `auth.controller.ts` |
| S5 | Signing in from a browser the account hasn't used before **emails the owner** (not on the very first sign-in). | `auth.service.ts` |
| S6 | **Account activation / deactivation:** disabling a person's access ends their open sessions in that school immediately; a disabled or not-yet-activated account can't sign in. | `memberships.service.ts`, `auth.service.ts` |
| S7 | **Email verification:** registration sends a link; opening it verifies the address (single-use). Accepting an invitation counts as proof of ownership. Where `REQUIRE_EMAIL_VERIFICATION` is on (default in production), sensitive actions wait until the email is verified. Resending is limited to once a minute per account and 5 an hour. | `auth.service.ts`, `permission.guard.ts` |

Tests: *sign-in protection*, *sessions, devices and “keep me signed in”*, *protecting the people in charge*, *sensitive actions need a fresh password*.

## 4. Authorization

| # | Rule | Enforced in |
|---|---|---|
| Z1 | **Every route is authorized on the server.** The web app hides things for convenience only. Guards run in this order: `AuthGuard` → `SchoolContextGuard` → `PermissionGuard`; a new route must use all three plus `@RequirePermission`. | `authorization/guards/*` |
| Z2 | **Role-based, permission-based and scoped:** a role is a set of permissions; each grant has a scope (`ALL_SCHOOL`, `OWN_CLASSES`, `OWN_CHILDREN`, `SELF`…) which the service layer applies to the data, not only the route. | `authorization.service.ts` |
| Z3 | **Tenant isolation:** the school comes from the session, never from a request parameter. Every query is filtered by it; another school's id returns "not found". | `school-context.guard.ts`, every service |
| Z4 | **Sensitive actions need a fresh password.** Handlers marked `@SensitiveAction()` — inviting people, changing someone's role, disabling or reactivating access, creating or editing a role, inviting a parent — also require a password confirmation in the last 10 minutes (`REAUTH_WINDOW_MINUTES`). Without it the API answers `403 REAUTH_REQUIRED`; the web app shows a "Confirm it's you" dialog and retries. Sign-in counts as confirmation. Wrong confirmations count toward the lockout. | `sensitive-action.decorator.ts`, `permission.guard.ts`, `auth.controller.ts` (`/auth/reauth`) |

Tests: *sensitive actions need a fresh password*, *tenant isolation*; cross-tenant matrices in every module's e2e file.

## 5. Audit and security activity

| # | Rule | Enforced in |
|---|---|---|
| L1 | **Every state-changing request (POST/PUT/PATCH/DELETE) by a signed-in person is recorded** (`api.write`: who, school, route, status, IP, device) by a global interceptor, so a forgotten `audit.record()` can't create a blind spot. Important actions also write an explicit, descriptive entry (`user.invite_created`, `user.role_changed`, `role.update`…). | `audit-trail.interceptor.ts` |
| L2 | Entries record **the person who acted**, not the person it was done to. | `memberships.service.ts` |
| L3 | **Security activity is tracked:** failed sign-ins, sign-ins, password changes and resets, session revokes, re-auth attempts, email verification, and every 403 given to a signed-in person (`access.denied`). | `auth.service.ts`, `http-exception.filter.ts` |
| L4 | **Never record secrets.** The audit log and application logs never contain request bodies, passwords, reset/invite/verification tokens, or session values. | `audit-trail.interceptor.ts` (metadata is `{method, route, status}` only) |
| L5 | **The audit log is read-only and Director-only** (`audit.view`), scoped to the school, with search, area and date filters. Nothing in the API edits or deletes an entry. People can always see their own security activity on **My profile → Security**. | `audit.controller.ts` |

Tests: *audit trail*, *logs*.

## 6. Files, API surface and input

| # | Rule | Enforced in |
|---|---|---|
| F1 | **Secure file access:** documents are downloaded only through the API after the same permission and scope checks as the record they belong to — never by a public URL. Downloads are sent as attachments with the stored type. | `documents.service.ts` |
| F2 | **Uploads are identified by content, not by what the uploader says.** PDF, PNG and JPEG are recognised by their first bytes; a mismatch or empty file is refused, and the detected type is what gets stored. Size is capped. | `documents.service.ts` (`sniffDocumentType`) |
| R1 | **Rate limiting:** one global limit on every route (`RATE_LIMIT_PER_MINUTE`, default 600/min per IP) plus tighter limits on login, register, forgot/reset password, accept-invite, re-auth and verification. Counters live in Redis when `REDIS_URL` is set, so they hold across instances; otherwise in memory. | `app.module.ts`, `redis-throttler.storage.ts`, `@Throttle` on routes |
| H1 | **Secure API access:** security headers on every response (`nosniff`, `X-Frame-Options: DENY`, `no-referrer`, a locked-down CSP, `Permissions-Policy`, `Cache-Control: no-store`, HSTS in production); `X-Powered-By` removed; CORS limited to `WEB_ORIGIN`; state-changing requests from any other origin are refused; `TRUST_PROXY` set correctly behind a proxy so IP limits and the audit log see the real address. | `security-headers.middleware.ts`, `origin-check.middleware.ts`, `main.ts` |
| V1 | **Data validation:** every request body is validated with the shared Zod schemas (`packages/validation`) on the server; unknown fields are dropped, malformed ones return `400` with field-level details. Never trust the web form to have validated. | `zod-validation.pipe.ts` |
| V2 | Errors never leak stack traces, SQL or internals — one filter shapes every error. | `http-exception.filter.ts` |

Tests: *secure file access*, *secure API access*, *sign-in protection* (limits), *validates input*.

---

## Checklist: the original requirements

| Requirement | Status | Where |
|---|---|---|
| User login / logout | ✅ | S1, S3 — `auth.controller.ts`; logout deletes the server-side session |
| Secure password authentication | ✅ | P1, P2 |
| Password hashing | ✅ | P1 (Argon2id) |
| Forgot / reset password | ✅ | P3 |
| Email verification | ✅ **added** | S7 — `/auth/verify-email`, `/auth/resend-verification`, web `/verify-email` and banner |
| Session management | ✅ | S1, S3 |
| Remember session | ✅ **added** | S3 — "Keep me signed in" on the login page |
| Login attempt protection | ✅ **added** | S2 |
| Account activation / deactivation | ✅ | S6 (sessions now end immediately) |
| User session / device management | ✅ **added** | S4, S5 — My profile → Security |
| Role-based access control | ✅ | Z1, Z2 |
| Permission-based authorization | ✅ | Z1, Z2 |
| Permission scopes | ✅ | Z2 |
| Server-side authorization | ✅ | Z1 |
| Tenant isolation | ✅ | Z3 |
| Audit logging | ✅ **extended** | L1, L2, L5 — Audit log page for the Director |
| Security activity tracking | ✅ **added** | L3 — Security tab and Audit log |
| Sensitive-action protection | ✅ **added** | Z4, A6, A7 |
| Secure file access | ✅ **hardened** | F1, F2 |
| Rate limiting | ✅ **hardened** | R1 |
| Data validation | ✅ | V1; password policy P2 |
| Secure API access | ✅ **hardened** | H1, V2 |
| Only school owners create their own account; teachers, staff, students and parents are added by the school | ✅ **enforced** | A1–A7 |

## Adding a feature — the short checklist

1. New route? `@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)` and `@RequirePermission(...)`. Scope the data in the service (Z1–Z3).
2. Does it invite, grant, disable, or change who can do what? Add `@SensitiveAction()` and call `assertCanGrant` / `assertCanAssignRole` (Z4, A6).
3. Does it accept input? Add a Zod schema in `packages/validation` and use `ZodValidationPipe` (V1).
4. Does it change data? It is audited automatically (L1); add an explicit `audit.record()` if the event deserves a readable name. Never put a secret in `metadata` (L4).
5. Does it accept a file? Reuse the document upload path (F2).
6. Does it send a link or token? Single-use, hashed at rest, expiring, retired when a newer one is issued (A3, P3).
7. Add a test next to the ones above. A cross-tenant case is mandatory.
