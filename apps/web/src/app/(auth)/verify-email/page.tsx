'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Spinner } from '@schovexa/ui';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { api, ApiError } from '../../../lib/api-client';
import { CURRENT_USER_QUERY_KEY } from '../../../hooks/useCurrentUser';
import { AuthCardHeader } from '../../../components/auth-card-header';

type State = { kind: 'working' } | { kind: 'done' } | { kind: 'failed'; message: string };

// The page the "Confirm your email" link opens. The token is spent once, so
// it is submitted a single time (a ref guards React's dev double-effect).
function VerifyEmail() {
  const token = useSearchParams().get('token');
  const queryClient = useQueryClient();
  const sent = useRef(false);
  const [state, setState] = useState<State>(token ? { kind: 'working' } : { kind: 'failed', message: 'This link is missing its token. Please open the link from your email again.' });

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    api
      .post('/auth/verify-email', { token })
      .then(() => {
        setState({ kind: 'done' });
        queryClient.invalidateQueries({ queryKey: CURRENT_USER_QUERY_KEY });
      })
      .catch((err) => setState({ kind: 'failed', message: err instanceof ApiError ? err.message : 'We could not verify your email. Please try again.' }));
  }, [token, queryClient]);

  return (
    <Card className="p-8 shadow-elevated sm:p-10">
      <AuthCardHeader
        icon={<MailCheck size={24} />}
        title={state.kind === 'done' ? 'Email confirmed' : 'Confirming your email'}
        description={state.kind === 'done' ? 'Thanks — your email address is verified.' : 'One moment while we check your link.'}
      />
      <div className="mt-7 flex flex-col gap-4">
        {state.kind === 'working' && (
          <div className="flex justify-center py-4">
            <Spinner size={28} />
          </div>
        )}
        {state.kind === 'failed' && (
          <>
            <Alert variant="error">{state.message}</Alert>
            <p className="text-sm text-slate-500">Links work once and expire after a while. Sign in and use “Resend” in the banner to get a fresh one.</p>
          </>
        )}
        {state.kind === 'done' && (
          <Link href="/dashboard">
            <Button size="lg" className="w-full">Go to my dashboard</Button>
          </Link>
        )}
        {state.kind !== 'done' && (
          <Link href="/login" className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-brand-blue hover:underline">
            <ArrowLeft size={15} /> Back to login
          </Link>
        )}
      </div>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<Spinner size={28} />}>
      <VerifyEmail />
    </Suspense>
  );
}
