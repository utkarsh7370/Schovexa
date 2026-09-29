'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Alert, Spinner, Avatar } from '@schovexa/ui';
import { ArrowRight, Building } from 'lucide-react';
import { api, ApiError } from '../../../lib/api-client';
import { AuthCardHeader } from '../../../components/auth-card-header';
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
    <Card className="p-8 shadow-elevated sm:p-10">
      <AuthCardHeader icon={<Building size={24} />} title="Choose a school" description="You have access to more than one school. Pick where to go." />

      {error && (
        <Alert variant="error" className="mt-4">
          {error}
        </Alert>
      )}

      <div className="mt-7 flex flex-col gap-3">
        {me.memberships.map((membership, i) => (
          <button
            key={membership.membershipId}
            onClick={() => selectSchool(membership.membershipId)}
            disabled={selectingId !== null}
            style={{ animationDelay: `${i * 80}ms` }}
            className="group flex animate-fade-in-up items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-blue/50 hover:shadow-elevated disabled:opacity-60"
          >
            <Avatar name={membership.schoolName} size={44} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-navy">{membership.schoolName}</span>
              <span className="block text-sm text-slate-500">{membership.roleName}</span>
            </span>
            {selectingId === membership.membershipId ? (
              <Spinner size={18} />
            ) : (
              <ArrowRight size={18} className="text-slate-300 transition-all group-hover:translate-x-1 group-hover:text-brand-blue" />
            )}
          </button>
        ))}
      </div>
    </Card>
  );
}
