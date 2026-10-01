'use client';

import { useEffect, useState } from 'react';
import { Alert, Badge, Button, EmptyState, PageHeader, Skeleton, StatCard } from '@schovexa/ui';
import { CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Hourglass, LogIn, LogOut, MessageSquareText, Timer, XCircle } from 'lucide-react';
import { useMyStaffAttendance } from '../../../../hooks/useStaffAttendance';
import { APPROVAL_BADGE, PunchCard, formatClock, formatHmLabel } from '../../../../components/punch-card';

const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export default function MyAttendancePage() {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const { data, isLoading, isError } = useMyStaffAttendance(month);
  // The server decides what "this month" is (in the school's time zone);
  // remember it from the first load so the next-month arrow can't run ahead.
  const [homeMonth, setHomeMonth] = useState<string | null>(null);
  useEffect(() => {
    if (data && month === undefined && !homeMonth) setHomeMonth(data.month);
  }, [data, month, homeMonth]);
  const shown = data?.month ?? month;
  const atCurrent = !shown || !homeMonth || shown >= homeMonth;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Teaching" title="My Attendance" description="Punch in when you arrive and out when you leave. Your Principal approves each day." />

      <div className="mt-6">
        <PunchCard />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Days present" tone="emerald" icon={<CalendarCheck size={18} />} value={data ? data.summary.daysPresent : <Skeleton className="h-8 w-10" />} hint={shown ? monthLabel(shown) : undefined} />
        <StatCard label="Late arrivals" tone="amber" icon={<Timer size={18} />} value={data ? data.summary.daysLate : <Skeleton className="h-8 w-10" />} hint={data ? `After ${formatHmLabel(data.schedule.punchIn)} + ${data.schedule.graceMinutes} min` : undefined} />
        <StatCard label="Awaiting approval" tone="violet" icon={<Hourglass size={18} />} value={data ? data.summary.pendingApproval : <Skeleton className="h-8 w-10" />} />
        <StatCard label="Rejected" tone="default" icon={<XCircle size={18} />} value={data ? data.summary.rejected : <Skeleton className="h-8 w-10" />} />
      </div>

      <section className="mt-8 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-navy">
            <CalendarDays size={18} className="text-brand-blue" /> {shown ? monthLabel(shown) : 'This month'}
          </h2>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" aria-label="Previous month" disabled={!shown} onClick={() => shown && setMonth(shiftMonth(shown, -1))}>
              <ChevronLeft size={16} />
            </Button>
            <Button size="sm" variant="secondary" aria-label="Next month" disabled={!shown || atCurrent} onClick={() => shown && setMonth(shiftMonth(shown, 1))}>
              <ChevronRight size={16} />
            </Button>
          </div>
        </header>

        <div className="mt-5 flex flex-col gap-2">
          {isError && <Alert variant="error">We couldn’t load your attendance. Please refresh and try again.</Alert>}
          {isLoading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          {data && data.records.length === 0 && (
            <EmptyState icon={<CalendarCheck size={22} />} title="No attendance this month" description="Days you punch in will be listed here with their approval status." />
          )}
          {data?.records.map((r) => {
            const approval = APPROVAL_BADGE[r.approval];
            return (
              <article key={r.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 transition-colors hover:border-brand-blue/30 hover:bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-navy">{dayLabel(r.date)}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1.5"><LogIn size={14} /> {formatClock(r.punchInAt)}</span>
                      <span className="inline-flex items-center gap-1.5"><LogOut size={14} /> {r.punchOutAt ? formatClock(r.punchOutAt) : 'Not punched out'}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {r.lateMinutes > 0 && <Badge tone="warning">Late {r.lateMinutes} min</Badge>}
                    {r.earlyLeaveMinutes > 0 && <Badge tone="warning">{r.earlyLeaveMinutes} min early</Badge>}
                    <Badge tone={approval.tone} dot pulse={r.approval === 'PENDING'}>
                      {approval.label}
                    </Badge>
                  </div>
                </div>
                {r.decisionNote && r.decisionNote !== 'Auto-approved' && (
                  <p className="mt-3 flex items-start gap-2 rounded-lg bg-white p-3 text-sm text-slate-600 ring-1 ring-inset ring-slate-100">
                    <MessageSquareText size={15} className="mt-0.5 shrink-0 text-slate-400" /> {r.decisionNote}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
