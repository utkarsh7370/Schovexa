'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@schovexa/ui';
import type { CurrentUser } from '@schovexa/types';
import { api } from '../lib/api-client';

// Screens that only make sense for someone who is NOT signed in. A
// signed-in user who opens one (bookmark, back button, typed URL) is sent
// on to their workspace instead of being shown a login form.
//
// Deliberately not listed: /select-school (needs a session),
// /accept-invite and /reset-password (single-use links that must work
// from any browser state, including one signed in as someone else).
const GUEST_ONLY = new Set(['/login', '/register', '/forgot-password']);

// Own query key, discarded on unmount (gcTime 0): the normal
// ['auth','me'] cache must never inherit this check's "401 — not signed
// in" result, or the dashboard would briefly see a stale error right
// after a fresh login.
const GUEST_CHECK_KEY = ['auth', 'guest-check'];

export function GuestGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const guestOnly = GUEST_ONLY.has(pathname);

  const { data: me, isLoading } = useQuery({
    queryKey: GUEST_CHECK_KEY,
    queryFn: () => api.get<CurrentUser>('/auth/me'),
    enabled: guestOnly,
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });

  useEffect(() => {
    if (!me) return;
    router.replace(me.activeSchoolId ? '/dashboard' : '/select-school');
  }, [me, router]);

  if (!guestOnly) return <>{children}</>;

  // Hold the form back until we know — otherwise a signed-in user would
  // see the login form flash before being redirected. A signed-out
  // visitor waits for one fast 401.
  if (isLoading || me) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-sm text-slate-500" role="status">
        <Spinner size={26} />
        {me ? 'You’re already signed in — taking you to your workspace…' : 'One moment…'}
      </div>
    );
  }
  return <>{children}</>;
}
