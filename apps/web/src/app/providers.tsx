'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@schovexa/ui';
import './sentry.client.config';
import { MarketProvider } from '../components/market-provider';
import { ReauthProvider } from '../components/reauth-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false, // an ApiError (401/403/404) retrying won't become success
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <MarketProvider>
        <ToastProvider>
          <ReauthProvider>{children}</ReauthProvider>
        </ToastProvider>
      </MarketProvider>
    </QueryClientProvider>
  );
}
