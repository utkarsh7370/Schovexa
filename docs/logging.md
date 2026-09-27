# Schovexa — Logging Architecture

Status: Phase 1 design deliverable (closes the logging-architecture gap
tracked in `docs/architecture.md` §16). Governs `apps/api` request/error
logging; distinct from `AuditLog` (`docs/database.md` §9), which is
business-event history visible to school admins, not an operational log.

## 1. Logging vs. Audit — Not the Same Thing

| | Logging (this doc) | AuditLog (`docs/database.md` §9) |
|---|---|---|
| Audience | Engineers, on-call, observability tooling | School admins, platform admins |
| Storage | Log aggregator (stdout → collector), not Postgres | Postgres, queryable via product UI |
| Retention | Short-to-medium (e.g. 30–90 days), cost-driven | Long, compliance/history-driven |
| Content | Request/error diagnostics | Business actions (`fee.collect`, `user.disable`, ...) |

A sensitive business action is **both**: logged operationally (this doc)
*and* written to `AuditLog`. The two are not substitutes for each other.

## 2. Log Levels

| Level | Used for |
|---|---|
| `error` | Unhandled exceptions, failed external calls (payment gateway, storage) after retries exhausted, anything a 500 response results from |
| `warn` | Handled-but-notable conditions: rate limit triggered, permission denied on a sensitive action, a retried external call |
| `info` | Request completion (method, path, status, duration), successful auth events, application startup/shutdown |
| `debug` | Verbose diagnostic detail — enabled only in development/staging, never in production by default |

Production runs at `info` and above by default; `debug` can be enabled
temporarily and scoped (e.g. per-module) for incident investigation, not
left on continuously.

## 3. Structured Log Schema

Every log line is structured JSON (not free-text interpolation), so it's
machine-parseable by the aggregator:

```json
{
  "timestamp": "2026-01-15T10:22:31.482Z",
  "level": "info",
  "message": "request completed",
  "requestId": "req_c8x2...",
  "userId": "usr_9f1a...",
  "schoolId": "sch_3b7e...",
  "method": "POST",
  "path": "/api/v1/attendance",
  "statusCode": 201,
  "durationMs": 42
}
```

- `requestId`: generated per request (middleware, before any handler
  runs), returned to the client in an `X-Request-Id` response header,
  and included in every log line and error response produced during that
  request — this is the correlation ID that ties a user's bug report to
  the exact log lines, and ties together logs from multiple services if
  the request fans out (e.g. to a background job) by propagating the
  same ID into the job payload.
- `userId`/`schoolId`: included whenever an authenticated `AuthContext`
  exists for the request — omitted (not `null`-padded) for
  unauthenticated requests (e.g. login attempts before success).
- Error logs additionally include `stack` and `errorCode` — but this
  full detail goes to the log aggregator only, never into the HTTP error
  response body (`docs/api.md` §3, §4).

## 4. Redaction Rules (binding, restates and extends `docs/authentication.md` §10)

Never logged, at any level, in any environment, in message text or in
structured fields: passwords, password hashes, session tokens/cookies,
password reset/invite/verification tokens, API keys, payment gateway
secrets and raw payment credentials, full request bodies of
authentication endpoints. A logging middleware/interceptor applies a
field-name denylist (`password`, `token`, `secret`, `authorization`,
`cookie`, case-insensitive) that redacts matching fields to `"[REDACTED]"`
before a log line is ever serialized — this is enforced centrally, not
left to each call site to remember.

CI includes a test that asserts a captured log stream from an
integration test run of the login/reset flows contains no raw password
or token value, per the testing requirement already stated in
`docs/authentication.md` §11 — this document is what that test asserts
against structurally (the redaction middleware), not just spot-checked
manually.

## 5. Where Logs Go

- **Development**: pretty-printed to stdout for local readability.
- **Staging/Production**: structured JSON to stdout, collected by the
  hosting platform's log pipeline (e.g. CloudWatch, a Vercel/Railway/
  Render log drain, or a self-hosted collector) and forwarded to an
  error-monitoring service (e.g. Sentry) for `error`-level events
  specifically — Sentry captures exceptions with stack traces and
  request context (already redacted per §4) for alerting; it is not the
  general-purpose log store.
- Health checks (`/api/v1/health`) are excluded from `info`-level
  request logging to avoid drowning real traffic in load-balancer probe
  noise — logged only if they fail.

Exact provider choice is a Phase 15 (Production Infrastructure) decision
tied to the deployment target (`docs/product-requirements.md` §9); this
document fixes the *shape and rules* of what gets logged regardless of
where it ends up.

## 6. Request Logging Middleware (design)

Applied globally in `apps/api`, before route handlers:

```
Request in
  → generate requestId, attach to request context
  → record start time
Request out (success or error, via a global interceptor + exception filter)
  → log one "request completed" line: method, path, statusCode,
    durationMs, requestId, userId?, schoolId?
  → on error: log one additional "error" line with errorCode, message,
    stack (redacted per §4), same requestId
```

One line per request on the happy path (not one line per internal step)
keeps volume manageable; `debug`-level logging inside services is
available for deeper tracing when explicitly enabled.

## 7. What This Does Not Cover

- `AuditLog` business-event logging — see `docs/database.md` §9 and
  `docs/authorization.md`; sensitive actions write there regardless of
  what this document's request logging captures.
- Alerting thresholds and on-call rotation — a Phase 15 operational
  concern, not an architecture one.
- Frontend error logging (e.g. a browser-side Sentry setup for
  `apps/web`) — noted as a Phase 2+ addition, not required for the
  backend-focused MVP observability baseline this document defines.
