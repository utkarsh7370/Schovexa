'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

// App Router's last-resort error boundary — catches errors the root
// layout itself throws, which no ordinary error.tsx can (it renders
// alongside, not inside, the root layout). Sentry.captureException is a
// safe no-op when no DSN is configured (see sentry.client.config.ts).
//
// It replaces the root layout entirely, so globals.css and Tailwind are
// NOT loaded here — hence plain inline styles rather than class names.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          background: 'linear-gradient(135deg,#f8fafc,#ffffff,#f0f9ff)',
          color: '#001040',
        }}
      >
        <div style={{ maxWidth: 440 }}>
          <div
            style={{
              fontSize: 96,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: '-0.05em',
              background: 'linear-gradient(90deg,#f43f5e,#dc2626)',
              WebkitBackgroundClip: 'text',
              color: 'transparent',
            }}
          >
            500
          </div>
          <h1 style={{ margin: '16px 0 8px', fontSize: 26 }}>Something went wrong on our side</h1>
          <p style={{ margin: 0, color: '#475569', lineHeight: 1.6 }}>
            An unexpected error stopped the app from loading. Please refresh the page. If it keeps happening, contact support.
          </p>
          <div style={{ marginTop: 28 }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                cursor: 'pointer',
                border: 0,
                borderRadius: 12,
                padding: '12px 24px',
                fontSize: 15,
                fontWeight: 700,
                color: '#fff',
                background: 'linear-gradient(135deg,#00B0F0,#0080F0 50%,#7020F0)',
              }}
            >
              Refresh the page
            </button>
          </div>
          {error.digest && <p style={{ marginTop: 24, fontFamily: 'monospace', fontSize: 12, color: '#94a3b8' }}>Reference: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
