# Schovexa

**Smart Schools. Better Futures.**

Schovexa is a multi-tenant School ERP SaaS platform: one codebase,
configured per school, serving many schools with strict tenant isolation.

## Status

Phase 0 (Product Definition & Architecture) — no application code yet.
See `docs/` for the current documentation set:

- [`docs/product-requirements.md`](docs/product-requirements.md) — vision, target users, MVP scope, business rules, open questions
- [`docs/user-roles.md`](docs/user-roles.md) — platform and school role model
- [`docs/permissions.md`](docs/permissions.md) — permission format, scopes, enforcement contract
- [`docs/modules.md`](docs/modules.md) — MVP / Phase 2 / Phase 3 module plan
- [`docs/architecture.md`](docs/architecture.md) — system, database, auth, multi-tenancy, and deployment architecture

Implementation (Prisma schema, NestJS API, Next.js web app) begins after
the architecture validation checklist in `docs/architecture.md` §17 is
confirmed.

## Core Principle

**Build Once. Configure Per School. Serve Many Schools.**

No school-specific code forks. No hardcoded role checks. No client-trusted
tenant IDs. See `docs/architecture.md` for the non-negotiable rules this
project is built around.
