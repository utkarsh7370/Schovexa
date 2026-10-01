'use client';

import Link from 'next/link';
import { ArrowRight, UserCheck } from 'lucide-react';
import { Badge } from '@schovexa/ui';
import { useStaffAttendancePending } from '../hooks/useStaffAttendance';
import { useCan } from '../hooks/useCan';

// Dashboard banner for whoever approves staff attendance: how many days are
// waiting. Renders nothing when the queue is empty.
export function StaffAttendanceAttention() {
  const { can } = useCan();
  const { data } = useStaffAttendancePending(can('staffAttendance.approve'));
  if (!data || data.count === 0) return null;

  return (
    <section className="mt-6" aria-label="Staff attendance approvals">
      <div className="relative overflow-hidden rounded-2xl border border-violet-300 bg-gradient-to-r from-violet-50 via-indigo-50 to-violet-50 p-5 shadow-card">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-violet-400 to-indigo-500" aria-hidden="true" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400 to-indigo-500 text-white shadow-[0_10px_24px_-8px_rgba(124,58,237,0.6)]">
              <UserCheck size={22} />
            </span>
            <div className="min-w-0">
              <h2 className="flex flex-wrap items-center gap-2 text-base font-bold text-violet-950">
                {data.count} staff attendance {data.count === 1 ? 'day needs' : 'days need'} your approval
                <Badge tone="brand" pulse>
                  {data.people} {data.people === 1 ? 'person' : 'people'}
                </Badge>
              </h2>
              <p className="mt-1 text-sm text-violet-900/80">Teachers have punched in. Check the day and approve it, or reject it with a reason.</p>
            </div>
          </div>
          <Link
            href="/dashboard/staff-attendance"
            className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated"
          >
            Review attendance <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
