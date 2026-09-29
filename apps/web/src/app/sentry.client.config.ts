import * as Sentry from '@sentry/nextjs';

// Same "opt-in via env var presence" seam used across this project
// (EmailService, StorageService, apps/api's monitoring/sentry.ts) — with
// no DSN set, Sentry.init() is never called and stays a safe no-op.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}
