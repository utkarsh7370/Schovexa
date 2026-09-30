'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { ServerErrorState } from './error-state';

// Shared body of the App Router error boundaries (error.tsx). Reports to
// Sentry (a safe no-op without a DSN) and offers a retry that re-renders
// the failed segment. `digest` is Next's server-side error id — the one
// thing safe to show a user and useful to support.
export function RouteError({ error, reset, fullScreen }: { error: Error & { digest?: string }; reset: () => void; fullScreen?: boolean }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return <ServerErrorState fullScreen={fullScreen} onRetry={reset} reference={error.digest} />;
}
