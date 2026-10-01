# Deploying Schovexa

Two supported paths: a managed platform (least ops work, recommended for
a solo founder) or a self-hosted VPS with Docker Compose (more control,
more to maintain yourself). Both use the same `apps/api/Dockerfile` and
`apps/web/Dockerfile`.

## Required configuration, either way

Generate a real session secret once and never reuse it across
environments:

```
openssl rand -hex 32
```

Set these on whichever platform you deploy to (see `.env.example` for
the full list and what each one does):

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `SESSION_SECRET` | yes | from `openssl rand -hex 32` above |
| `WEB_ORIGIN` | yes | your web app's real origin, e.g. `https://app.yourschool.com` — used for CORS and the origin-check CSRF mitigation, and as the base for invite/reset links |
| `NEXT_PUBLIC_API_URL` | yes | your API's real URL, e.g. `https://api.yourschool.com/api/v1` — baked into the web build at build time |
| `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_REGION` | recommended | leave blank and documents fall back to local disk, which does **not** survive a redeploy and isn't backed up — fine for a demo, not for real users |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | recommended | leave `SMTP_HOST` blank and invite/reset emails (and the contact-form notification) are only logged, not sent |
| `CONTACT_INBOX_EMAIL` | optional | where the website's Contact form is emailed (defaults to the founder's inbox). Messages are always saved in the `ContactMessage` table too |
| `SENTRY_DSN` (API), `NEXT_PUBLIC_SENTRY_DSN` (web) | recommended | leave blank and errors are only logged locally, never reported anywhere — see "Error monitoring" below |

You'll need to sign up for these yourself — this is the one part of
"go live" that isn't just code:
- A Postgres host (bundled if you use the managed-platform path below).
- An S3-compatible bucket: AWS S3, Cloudflare R2, or Backblaze B2 all
  work — R2 and B2 are the cheapest for a small school.
- An SMTP-sending account: Resend, Postmark, SES, or even a Google
  Workspace account's SMTP relay all work over the same `nodemailer`
  transport.
- A Sentry project (sentry.io has a free tier) — one project's DSN can
  be reused for both `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`, or use
  two projects if you want API and web errors kept separate.

## Option A: Managed platform (recommended)

Railway, Render, or Fly.io all work the same way here: they build
`apps/api/Dockerfile` and `apps/web/Dockerfile` as two separate services
from this one repo, and offer a managed Postgres add-on with automatic
backups included — meaning you get Item 4 (backups) "for free" as part
of hosting, without also needing `scripts/backup-db.sh` yourself (keep
it anyway as a portable, platform-independent fallback).

Steps (Railway as the concrete example; Render/Fly.io are equivalent):

1. Create a new project, add a **Postgres** plugin — it gives you a
   `DATABASE_URL` and daily automatic backups out of the box.
2. Add a service from this repo for the API: set its Dockerfile path to
   `apps/api/Dockerfile` and build context to the repo root. Set the env
   vars from the table above (`DATABASE_URL` from the Postgres plugin).
3. Add a second service from this repo for the web app: Dockerfile path
   `apps/web/Dockerfile`, same build context. Set `NEXT_PUBLIC_API_URL`
   as a **build-time** variable (Railway calls these "build args" or you
   can set it as a regular env var — either way it must be present
   during `docker build`, not just at runtime, since Next.js inlines
   `NEXT_PUBLIC_*` vars into the client bundle).
4. Point custom domains at each service, then set `WEB_ORIGIN` on the
   API service to the web app's real domain and redeploy the API (the
   origin-check CSRF mitigation rejects requests from any other origin).
5. The API container runs `prisma migrate deploy` on every boot before
   starting the server (see `apps/api/Dockerfile`), so the schema stays
   in sync automatically on each deploy.

## Option B: Self-hosted VPS (Docker Compose)

Use `docker-compose.prod.yml`. This runs Postgres, the API, and the web
app on one server — you're responsible for backups (Item 4, below),
TLS, and OS updates yourself.

```
cp .env.example .env.prod
# edit .env.prod: fill in POSTGRES_PASSWORD, SESSION_SECRET, WEB_ORIGIN,
# NEXT_PUBLIC_API_URL, and the STORAGE_*/SMTP_* vars for real
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

This exposes the API on `:4000` and the web app on `:3000` directly —
put a reverse proxy (Caddy or nginx) in front of both for TLS and to
serve them on `:443` under your real domains. That's outside this
repo's scope since it depends on your specific domains/DNS.

> Every file path each Dockerfile's `COPY` instructions reference was
> verified to exist by actually running the exact build commands
> (`npm run build -w ...`, `prisma generate`) in this sandbox — but this
> sandbox has no Docker daemon available, so `docker build`/`docker
> compose up` itself could not be run end-to-end here. Run `docker
> compose -f docker-compose.prod.yml --env-file .env.prod up -d --build`
> once yourself before trusting it in production.

## Backups (Item 4)

If you're on a managed platform's Postgres add-on (Option A), you
likely already have automatic backups — check your platform's dashboard
before also setting these scripts up.

For self-hosting (Option B), or as a platform-independent backup you
control yourself either way:

```
# Back up (writes a timestamped, compressed dump to ./backups by default)
DATABASE_URL="postgresql://user:pass@host:5432/dbname" ./scripts/backup-db.sh

# Restore into an existing, empty database
DATABASE_URL="postgresql://user:pass@host:5432/dbname" ./scripts/restore-db.sh backups/schovexa-<timestamp>.dump
```

Run `backup-db.sh` on a daily cron job (or systemd timer) and copy the
resulting file off the database host — e.g. to the same S3-compatible
bucket you configured for document storage — so a lost server doesn't
also mean lost backups.

**This restore path has been tested for real**, not just written: a
dump of the dev database was restored into a fresh database and every
one of its 32 tables came back with an identical row count to the
source. Re-run that check yourself against a copy of production data
before you need it for real — a backup you've never restored isn't a
backup you can trust.

## Error monitoring (Item 7)

Both apps report uncaught errors to Sentry once `SENTRY_DSN` /
`NEXT_PUBLIC_SENTRY_DSN` are set — API 5xx/unhandled exceptions (via the
existing exception filter, which already logs them), and the web app's
client, server, and edge-runtime errors. Leave both blank and nothing is
sent anywhere; errors are still logged locally either way.

This is a manual, minimal Sentry setup (no `withSentryConfig` webpack
wrapper, no source-map upload, no `SENTRY_AUTH_TOKEN`) — deliberately,
since the wrapper's source-map upload needs a Sentry org/project slug
and auth token this deployment doesn't otherwise require, and a
misconfigured build-time upload step would be a worse failure mode than
plain, unminified stack traces in Sentry. Add the wrapper yourself later
if you want release/source-map tracking; it's additive, not a rewrite of
what's here.

Verified for real, not just via mocked unit tests: both the API's and
the web app's Sentry wiring were pointed at a local HTTP server standing
in for Sentry's ingest endpoint, and a real POST envelope with the
triggering error's exception and stack trace was confirmed arriving.

## A known pre-existing issue worth flagging

`npm audit` on `apps/web` reports a critical-severity advisory against
`next@14.2.35` itself (a handful of DoS-class issues fixed only in
Next.js 15.x — see `npm audit` for the specific CVEs). This predates
this deployment work and wasn't introduced by anything here; upgrading
Next.js a major version is a separate, riskier change that deserves its
own dedicated testing pass rather than riding in on an unrelated PR.
Worth scheduling before this goes in front of real users.
