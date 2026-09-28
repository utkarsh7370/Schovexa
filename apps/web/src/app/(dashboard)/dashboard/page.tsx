'use client';

import { Card } from '@schovexa/ui';
import { useCurrentUser } from '../../../hooks/useCurrentUser';
import { useCurrentSchool } from '../../../hooks/useCurrentSchool';

export default function DashboardHomePage() {
  const { data: me } = useCurrentUser();
  // school is undefined for a role without school.view (e.g. Teacher) —
  // that 403 is a permission gap, not "no active school" (see
  // dashboard-shell.tsx), so the role/membership below is resolved from
  // me.activeSchoolId, which every authenticated role can read, rather
  // than from the school object this page may not have.
  const { data: school } = useCurrentSchool();

  const activeMembership = me?.memberships.find((m) => m.schoolId === me?.activeSchoolId);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold text-navy">Welcome back, {me?.firstName}.</h1>
      <p className="mt-1 text-slate-600">
        {school ? (
          <>
            You&apos;re signed in to <span className="font-medium">{school.name}</span>
            {activeMembership && <> as {activeMembership.roleName}</>}.
          </>
        ) : (
          activeMembership && <>You&apos;re signed in as {activeMembership.roleName}.</>
        )}
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-slate-500">School</p>
          <p className="mt-1 text-lg font-semibold text-navy">{school?.name ?? '—'}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">Your role</p>
          <p className="mt-1 text-lg font-semibold text-navy">{activeMembership?.roleName ?? '—'}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">Timezone</p>
          <p className="mt-1 text-lg font-semibold text-navy">{school?.timezone ?? '—'}</p>
        </Card>
      </div>
    </div>
  );
}
