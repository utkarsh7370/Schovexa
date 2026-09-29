import * as SentryNode from '@sentry/node';
import { initSentry } from './sentry';

jest.mock('@sentry/node');

describe('initSentry', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  it('does not call Sentry.init when SENTRY_DSN is unset', () => {
    delete process.env.SENTRY_DSN;
    initSentry();
    expect(SentryNode.init).not.toHaveBeenCalled();
  });

  it('calls Sentry.init with the configured DSN when set', () => {
    process.env.SENTRY_DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';
    process.env.NODE_ENV = 'production';
    initSentry();
    expect(SentryNode.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: process.env.SENTRY_DSN, environment: 'production' }),
    );
  });
});
