import * as Sentry from '@sentry/node';

// Same "opt-in via env var presence" seam as EmailService/StorageService
// (docs/architecture.md) — with no SENTRY_DSN set, Sentry.init() is never
// called, and every Sentry.* call elsewhere (http-exception.filter.ts)
// becomes a safe no-op per the SDK's own documented behavior.
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    // Errors matter far more than performance traces for an MVP; a low
    // sample rate keeps this useful without a paid-tier event budget.
    tracesSampleRate: 0.1,
  });
}

export { Sentry };
