'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, useToast } from '@schovexa/ui';
import { ArrowRight, CalendarOff, CheckCircle2, Clock, Fingerprint, Hourglass, LogIn, LogOut, XCircle } from 'lucide-react';
import { api, ApiError } from '../lib/api-client';
import {
  STAFF_ATTENDANCE_MINE_KEY,
  STAFF_ATTENDANCE_PENDING_KEY,
  STAFF_ATTENDANCE_TODAY_KEY,
  useStaffAttendanceToday,
  type StaffAttendanceRecord,
} from '../hooks/useStaffAttendance';
import { useCan } from '../hooks/useCan';
import { NOTIFICATIONS_QUERY_KEY } from '../hooks/useNotices';

export const formatClock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export const formatHmLabel = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

export const APPROVAL_BADGE: Record<StaffAttendanceRecord['approval'], { label: string; tone: 'warning' | 'success' | 'danger'; icon: typeof Clock }> = {
  PENDING: { label: 'Awaiting approval', tone: 'warning', icon: Hourglass },
  APPROVED: { label: 'Approved', tone: 'success', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', tone: 'danger', icon: XCircle },
};

// The "mark me present" card: a live clock, the school's hours, one big
// button that does the right thing (punch in, then punch out), and what
// happened to today's record. Used on the dashboard and on My Attendance.
export function PunchCard({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const { can } = useCan();
  const allowed = can('staffAttendance.mark');
  const { data: today, isLoading, isError } = useStaffAttendanceToday(allowed);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  if (!allowed) return null;

  const record = today?.record ?? null;
  const done = !!record?.punchOutAt;
  const rejected = record?.approval === 'REJECTED';

  const act = async (kind: 'punch-in' | 'punch-out') => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/staff-attendance/${kind}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: STAFF_ATTENDANCE_TODAY_KEY }),
        queryClient.invalidateQueries({ queryKey: STAFF_ATTENDANCE_MINE_KEY }),
        queryClient.invalidateQueries({ queryKey: STAFF_ATTENDANCE_PENDING_KEY }),
        queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
      ]);
      toast.show({
        tone: 'success',
        title: kind === 'punch-in' ? 'You’re marked present' : 'You’ve punched out',
        description: kind === 'punch-in' ? 'Your Principal will approve it.' : 'Have a good evening!',
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const approval = record ? APPROVAL_BADGE[record.approval] : null;

  return (
    <section className={['relative overflow-hidden rounded-3xl bg-brand-gradient-dark p-6 text-white shadow-elevated sm:p-7', className].join(' ')} aria-label="Today’s attendance">
      <div className="bg-grid-light pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 animate-blob rounded-full bg-brand-electric/35 blur-3xl" aria-hidden="true" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/70">
            <Fingerprint size={14} /> My attendance today
          </p>
          <p className="mt-2 text-4xl font-extrabold tabular-nums tracking-tight">{now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</p>
          {today && (
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/75">
              <span className="inline-flex items-center gap-1.5">
                <Clock size={14} /> School hours {formatHmLabel(today.schedule.punchIn)} – {formatHmLabel(today.schedule.punchOut)}
              </span>
            </p>
          )}

          {record && (
            <ul className="mt-4 flex flex-wrap gap-2">
              <li className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ring-white/15">
                <LogIn size={13} /> In {formatClock(record.punchInAt)}
                {record.lateMinutes > 0 && <span className="rounded-full bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-bold text-navy">Late {record.lateMinutes} min</span>}
              </li>
              {record.punchOutAt && (
                <li className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ring-white/15">
                  <LogOut size={13} /> Out {formatClock(record.punchOutAt)}
                  {record.earlyLeaveMinutes > 0 && <span className="rounded-full bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-bold text-navy">{record.earlyLeaveMinutes} min early</span>}
                </li>
              )}
              {approval && (
                <li>
                  <Badge tone={approval.tone} dot pulse={record.approval === 'PENDING'} className="!bg-white/15 !text-white !ring-white/25">
                    <approval.icon size={12} /> {approval.label}
                  </Badge>
                </li>
              )}
            </ul>
          )}
          {rejected && record?.decisionNote && <p className="mt-3 max-w-md rounded-xl bg-red-500/20 p-3 text-sm text-white ring-1 ring-inset ring-red-300/30">“{record.decisionNote}”</p>}
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          {isLoading && <span className="text-sm text-white/70">Loading…</span>}
          {isError && <span className="text-sm text-white/80">Couldn’t load today’s status.</span>}
          {today?.holiday && !record && (
            <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold ring-1 ring-inset ring-white/20">
              <CalendarOff size={18} /> Holiday — {today.holiday.name}
            </div>
          )}
          {today && !today.holiday && !record && (
            <Button size="lg" loading={busy} onClick={() => act('punch-in')} className="!bg-white !text-navy !shadow-elevated hover:!bg-white/90">
              <LogIn size={18} /> Punch in
            </Button>
          )}
          {record && !done && !rejected && (
            <Button size="lg" loading={busy} onClick={() => act('punch-out')} className="!bg-white !text-navy !shadow-elevated hover:!bg-white/90">
              <LogOut size={18} /> Punch out
            </Button>
          )}
          {done && !rejected && <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-300"><CheckCircle2 size={18} /> Day complete</span>}
          {compact && (
            <Link href="/dashboard/my-attendance" className="group inline-flex items-center justify-end gap-1 text-xs font-semibold text-white/80 hover:text-white">
              My attendance history <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      </div>
      {error && (
        <Alert variant="error" className="relative mt-4">
          {error}
        </Alert>
      )}
    </section>
  );
}
