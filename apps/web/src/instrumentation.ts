// Next.js App Router's instrumentation hook (stable since Next 13.4, no
// experimental flag needed) — the one place server/edge runtime setup
// code is guaranteed to run before anything else.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = async (...args: Parameters<typeof import('@sentry/nextjs').captureRequestError>) => {
  const { captureRequestError } = await import('@sentry/nextjs');
  captureRequestError(...args);
};
