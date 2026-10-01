'use client';

import Link from 'next/link';
import { ArrowRight, CalendarCheck, MessageSquareText } from 'lucide-react';
import { Badge } from '@schovexa/ui';
import { useAcademicYearAttention } from '../hooks/useAcademicYears';
import { useCan } from '../hooks/useCan';

const fmt = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// Dashboard banner for the two academic-year moments that need a person:
// the Director has a proposal to decide, or the Principal has one the
// Director sent back. Renders nothing the rest of the time.
export function AcademicYearAttention() {
  const { can } = useCan();
  const { data } = useAcademicYearAttention(can('academicYear.view'));
  const awaiting = data?.awaitingApproval ?? [];
  const revise = data?.needsRevision ?? [];
  if (awaiting.length === 0 && revise.length === 0) return null;

  return (
    <section className="mt-6 flex flex-col gap-3" aria-label="Academic year approvals">
      {awaiting.map((year) => (
        <div key={year.id} className="relative animate-glow-pulse overflow-hidden rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 p-5 shadow-card">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-amber-400 to-orange-500" aria-hidden="true" />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-[0_10px_24px_-8px_rgba(245,158,11,0.7)]">
                <CalendarCheck size={22} />
              </span>
              <div className="min-w-0">
                <h2 className="flex flex-wrap items-center gap-2 text-base font-bold text-amber-950">
                  Academic year {year.name} needs your approval
                  <Badge tone="warning" pulse>
                    Waiting
                  </Badge>
                </h2>
                <p className="mt-1 text-sm text-amber-900/80">
                  {year.createdBy?.name ?? 'Your Principal'} proposed {fmt(year.startDate)} – {fmt(year.endDate)}. Check the details, then approve, reject or suggest changes.
                </p>
              </div>
            </div>
            <Link
              href={`/dashboard/academic-years?review=${year.id}`}
              className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated"
            >
              Review proposal <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      ))}

      {revise.map((year) => (
        <div key={year.id} className="relative overflow-hidden rounded-2xl border border-sky-300 bg-gradient-to-r from-sky-50 via-indigo-50 to-sky-50 p-5 shadow-card">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-sky-400 to-indigo-500" aria-hidden="true" />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 text-white shadow-[0_10px_24px_-8px_rgba(56,130,246,0.6)]">
                <MessageSquareText size={22} />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-sky-950">The Director suggested changes to {year.name}</h2>
                {year.decisionNote && <p className="mt-1 line-clamp-2 text-sm text-sky-900/80">“{year.decisionNote}”</p>}
              </div>
            </div>
            <Link
              href={`/dashboard/academic-years?edit=${year.id}`}
              className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated"
            >
              Edit &amp; resubmit <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      ))}
    </section>
  );
}
