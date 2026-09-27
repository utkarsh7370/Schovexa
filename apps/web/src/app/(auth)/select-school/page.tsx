'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Alert, Spinner } from '@schovexa/ui';
import { api, ApiError } from '../../../lib/api-client';
import type { CurrentUser } from '@schovexa/types';

// Only reached when a user has more than one school membership — the
// common single-membership case is auto-selected right after login
// (docs/multi-tenancy.md §2: switching schools is always a deliberate,
// server-validated action, never inferred).
export default function SelectSchoolPage() {
  const router = useRouter();
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<CurrentUser>('/auth/me')
      .then(setMe)
      .catch(() => router.push('/login'));
  }, [router]);

  const selectSchool = async (membershipId: string) => {
    setSelectingId(membershipId);
    setError(null);
    try {
      await api.post('/auth/select-school', { membershipId });
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not select this school.');
      setSelectingId(null);
    }
  };

  if (!me) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <Card className="p-8">
      <h1 className="text-xl font-bold text-navy">Choose a school</h1>
      <p className="mt-1 text-sm text-slate-500">You have access to more than one school.</p>

      {error && (
        <Alert variant="error" className="mt-4">
          {error}
        </Alert>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {me.memberships.map((membership) => (
          <button
            key={membership.membershipId}
            onClick={() => selectSchool(membership.membershipId)}
            disabled={selectingId !== null}
            className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left hover:border-brand-blue hover:bg-slate-50 disabled:opacity-60"
          >
            <span>
              <span className="block font-medium text-navy">{membership.schoolName}</span>
              <span className="block text-sm text-slate-500">{membership.roleName}</span>
            </span>
            {selectingId === membership.membershipId && <Spinner size={18} />}
          </button>
        ))}
      </div>
    </Card>
  );
}
