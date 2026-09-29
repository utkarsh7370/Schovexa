'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

// App Router's last-resort error boundary — catches errors the root
// layout itself throws, which no ordinary error.tsx can (it renders
// alongside, not inside, the root layout). Sentry.captureException is a
// safe no-op when no DSN is configured (see sentry.client.config.ts).
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-center">
        <div>
          <h1 className="text-xl font-bold text-navy">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-500">Please refresh the page. If this keeps happening, contact support.</p>
        </div>
      </body>
    </html>
  );
}
