'use client';

import { useState } from 'react';
import { Button, useToast } from '@schovexa/ui';
import { MailWarning } from 'lucide-react';
import { api, ApiError } from '../lib/api-client';
import type { CurrentUser } from '@schovexa/types';

// Shown above every dashboard page until the person confirms their email.
// Where a school's deployment requires verified emails, sensitive actions
// are blocked until then, so the banner says what to do and lets them
// resend the link.
export function EmailVerificationBanner({ me }: { me: CurrentUser }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (me.emailVerified) return null;

  const resend = async () => {
    setBusy(true);
    try {
      await api.post('/auth/resend-verification');
      toast.show({ tone: 'success', title: 'Link sent', description: `Check ${me.email} for the confirmation link.` });
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not send the link', description: err instanceof ApiError ? err.message : 'Please try again in a moment.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="status" className="flex flex-col gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <p className="flex items-start gap-2">
        <MailWarning size={18} className="mt-0.5 shrink-0" />
        <span>
          <strong>Confirm your email address.</strong> We sent a link to {me.email}. It keeps your account recoverable and unlocks sensitive actions.
        </span>
      </p>
      <Button size="sm" variant="secondary" className="shrink-0 whitespace-nowrap" loading={busy} onClick={resend}>
        Resend link
      </Button>
    </div>
  );
}
