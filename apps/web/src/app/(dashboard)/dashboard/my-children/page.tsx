'use client';

import { useMemo, useState } from 'react';
import { Avatar, Badge, Button, EmptyState, PageHeader, Skeleton, type BadgeTone } from '@schovexa/ui';
import { CalendarCheck, CircleAlert, Clock, GraduationCap, Heart, Library, MessageSquare, MessageSquareText, NotebookPen, School, Wallet } from 'lucide-react';
import { useCan } from '../../../../hooks/useCan';
import { StudentRemarksPanel, StudentResultsPanel } from '../../../../components/teaching/student-teaching-panels';
import { useStudents, useStudent } from '../../../../hooks/useStudents';
import { useAttendanceHistory, type AttendanceStatus } from '../../../../hooks/useAttendance';
import Link from 'next/link';
import { useFeePayments, useStudentFees } from '../../../../hooks/useFees';
import { formatMinor } from '../../../../lib/currency';
import { STUDENT_STATUS_LABELS, STUDENT_STATUS_TONES } from '../../../../components/student-card';

// This page's real audience is a Parent (GET /students already scopes
// down to just their linked children — see the OWN_CHILDREN fix in
// students.service.ts). Nothing stops another role from visiting it too
// (nav items are shown to every role, docs/frontend-architecture.md §5 —
// each route enforces its own permission server-side regardless), but a
// Director's whole-school roster would otherwise mean three extra
// requests per student here. Capped rather than paginated: a genuine
// parent never has more than a handful of children.
const MAX_CHILDREN_SHOWN = 12;

const FEE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
  WAIVED: 'Waived',
};
const FEE_STATUS_TONES: Record<string, BadgeTone> = {
  PENDING: 'warning',
  PARTIALLY_PAID: 'info',
  PAID: 'success',
  WAIVED: 'neutral',
};

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Circular progress: the one number a parent looks for first.
function AttendanceRing({ rate }: { rate: number | null }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const value = rate ?? 0;
  const color = rate === null ? 'text-slate-200' : rate >= 90 ? 'text-emerald-500' : rate >= 75 ? 'text-amber-500' : 'text-red-500';
  return (
    <div className="relative flex h-24 w-24 shrink-0 items-center justify-center" role="img" aria-label={rate === null ? 'No attendance yet' : `${rate}% attendance`}>
      <svg viewBox="0 0 80 80" className="-rotate-90">
        <circle cx="40" cy="40" r={radius} fill="none" strokeWidth="8" className="stroke-slate-100" />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          stroke="currentColor"
          className={[color, 'transition-all duration-1000 ease-out'].join(' ')}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-xl font-extrabold leading-none text-navy">{rate === null ? '—' : `${rate}%`}</p>
        <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">30 days</p>
      </div>
    </div>
  );
}

function Mini({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <span className={['flex h-6 w-6 items-center justify-center rounded-lg', tone].join(' ')}>{icon}</span>
        {label}
      </div>
      <p className="mt-2 truncate text-xl font-extrabold tracking-tight text-navy">{value}</p>
    </div>
  );
}

function ChildCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-card" role="status" aria-label="Loading">
      <Skeleton className="h-24 w-full rounded-none" />
      <div className="space-y-4 p-6">
        <Skeleton className="h-6 w-1/3" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

function ChildCard({ studentId, index }: { studentId: string; index: number }) {
  const { data: student } = useStudent(studentId);
  const range = useMemo(
    () => ({ to: toDateInput(new Date()), from: toDateInput(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) }),
    [],
  );
  const { data: history } = useAttendanceHistory(studentId, range.from, range.to);
  const { data: fees } = useStudentFees(studentId);

  const { counts, rate } = useMemo(() => {
    const c: Record<AttendanceStatus, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, HALF_DAY: 0 };
    (history ?? []).forEach((r) => (c[r.status] += 1));
    const total = history?.length ?? 0;
    return { counts: c, rate: total ? Math.round(((c.PRESENT + c.LATE + c.HALF_DAY * 0.5) / total) * 100) : null };
  }, [history]);

  if (!student) return <ChildCardSkeleton />;

  const fullName = `${student.firstName} ${student.lastName}`;
  const totalBalanceMinor = (fees ?? []).reduce((sum, fee) => sum + fee.balanceMinor, 0);
  const teacher = student.section?.classTeacher;

  return (
    <article
      className="animate-fade-in-up overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-card transition-shadow duration-300 hover:shadow-elevated"
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <div className="relative bg-brand-gradient-dark px-6 pb-14 pt-6 text-white">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 animate-blob rounded-full bg-brand-electric/30 blur-3xl" aria-hidden="true" />
        <div className="relative flex items-start justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Admission no. {student.admissionNo}</p>
          <Badge tone={STUDENT_STATUS_TONES[student.status] ?? 'neutral'} dot className="bg-white/95">
            {STUDENT_STATUS_LABELS[student.status] ?? student.status}
          </Badge>
        </div>
      </div>

      <div className="relative px-6 pb-6">
        <div className="-mt-10 flex flex-wrap items-start gap-4">
          <Avatar name={fullName} tone="auto" size={80} ring className="shadow-elevated" />
          {/* mt-10 = the avatar's overlap onto the banner, so the name starts on the white area below it. */}
          <div className="mt-10 min-w-0 flex-1">
            <h2 className="truncate text-xl font-extrabold tracking-tight text-navy">{fullName}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
              {student.section ? (
                <span className="inline-flex items-center gap-1.5">
                  <School size={14} className="text-brand-blue" /> {student.section.class.name} · Section {student.section.name}
                </span>
              ) : (
                <span>Class not assigned yet</span>
              )}
              {teacher && (
                <span className="inline-flex items-center gap-1.5">
                  <GraduationCap size={14} className="text-brand-violet" /> {teacher.user.firstName} {teacher.user.lastName}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[auto_1fr]">
          <div className="flex items-center gap-5 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
            <AttendanceRing rate={rate} />
            <div>
              <p className="text-sm font-bold text-navy">Attendance</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {history && history.length > 0 ? `${history.length} days recorded` : 'Nothing recorded yet'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini icon={<CalendarCheck size={14} />} label="Present" value={counts.PRESENT} tone="bg-emerald-100 text-emerald-600" />
            <Mini icon={<CircleAlert size={14} />} label="Absent" value={counts.ABSENT} tone="bg-red-100 text-red-600" />
            <Mini icon={<Clock size={14} />} label="Late" value={counts.LATE} tone="bg-amber-100 text-amber-600" />
            <Mini
              icon={<Wallet size={14} />}
              label="Fee balance"
              value={<span className={totalBalanceMinor > 0 ? 'text-amber-600' : 'text-emerald-600'}>{formatMinor(totalBalanceMinor)}</span>}
              tone="bg-sky-100 text-sky-600"
            />
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-bold text-navy">Fees</h3>
          {fees && fees.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-3">
              {fees.map((fee) => {
                const pct = fee.amountDueMinor > 0 ? Math.min(100, Math.round((fee.paidMinor / fee.amountDueMinor) * 100)) : 0;
                return (
                  <li key={fee.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-navy">{fee.feeCategory.name}</p>
                      <Badge tone={FEE_STATUS_TONES[fee.status] ?? 'neutral'}>{FEE_STATUS_LABELS[fee.status] ?? fee.status}</Badge>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200/70" aria-hidden="true">
                      <div className="h-full rounded-full bg-gradient-to-r from-brand-electric to-brand-blue transition-all duration-700" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Paid <span className="font-semibold text-emerald-600">{formatMinor(fee.paidMinor)}</span> of{' '}
                      <span className="font-semibold text-slate-700">{formatMinor(fee.netDueMinor)}</span>
                      {fee.discountMinor > 0 && <> (after a {formatMinor(fee.discountMinor)} discount)</>}
                    </p>
                    <FeeReceipts feeId={fee.id} paid={fee.paidMinor > 0} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No fees assigned yet.</p>
          )}
        </div>

        <ChildLearning studentId={studentId} />
      </div>
    </article>
  );
}

// Results, teacher notes and the shortcuts a parent uses to follow their child's learning.
function ChildLearning({ studentId }: { studentId: string }) {
  const { can } = useCan();
  const [open, setOpen] = useState<'results' | 'notes' | null>(null);
  const links = [
    can('homework.view') && { href: '/dashboard/homework', label: 'Homework', icon: <NotebookPen size={14} /> },
    can('content.view') && { href: '/dashboard/content', label: 'Study material', icon: <Library size={14} /> },
    can('message.view') && { href: '/dashboard/messages', label: 'Ask a teacher', icon: <MessageSquare size={14} /> },
  ].filter(Boolean) as { href: string; label: string; icon: React.ReactNode }[];
  const showResults = can('result.view');
  const showNotes = can('remark.view');
  if (links.length === 0 && !showResults && !showNotes) return null;
  return (
    <div className="mt-6 border-t border-slate-100 pt-5">
      <h3 className="text-sm font-bold text-navy">Learning</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {showResults && (
          <Button size="sm" variant={open === 'results' ? 'primary' : 'secondary'} onClick={() => setOpen(open === 'results' ? null : 'results')} aria-expanded={open === 'results'}>
            <GraduationCap size={14} /> Exam results
          </Button>
        )}
        {showNotes && (
          <Button size="sm" variant={open === 'notes' ? 'primary' : 'secondary'} onClick={() => setOpen(open === 'notes' ? null : 'notes')} aria-expanded={open === 'notes'}>
            <MessageSquareText size={14} /> Teacher notes
          </Button>
        )}
        {links.map((l) => (
          <Link key={l.href} href={l.href}>
            <Button size="sm" variant="secondary">{l.icon} {l.label}</Button>
          </Link>
        ))}
      </div>
      {open === 'results' && <div className="mt-4"><StudentResultsPanel studentId={studentId} /></div>}
      {open === 'notes' && <div className="mt-4"><StudentRemarksPanel studentId={studentId} /></div>}
    </div>
  );
}

// The receipts for payments on one fee, so a parent can keep or print them.
function FeeReceipts({ feeId, paid }: { feeId: string; paid: boolean }) {
  const { data: payments } = useFeePayments(paid ? feeId : undefined);
  const withReceipt = (payments ?? []).filter((p) => p.receipt);
  if (withReceipt.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {withReceipt.map((p) => (
        <li key={p.id}>
          <Link href={`/dashboard/receipts/${p.receipt?.id}`} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-brand-blue ring-1 ring-inset ring-brand-blue/20 hover:bg-brand-blue/5">
            Receipt {p.receipt?.receiptNo} · {formatMinor(p.amountMinor)}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function MyChildrenPage() {
  const { data: students, isLoading } = useStudents();
  const shown = students?.slice(0, MAX_CHILDREN_SHOWN);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Family" title="My Children" description="Attendance, fees, results and notes for your linked children, at a glance." />

      <div className="mt-6 flex flex-col gap-6">
        {isLoading && (
          <>
            <ChildCardSkeleton />
            <ChildCardSkeleton />
          </>
        )}
        {!isLoading && students?.length === 0 && (
          <EmptyState
            icon={<Heart size={22} />}
            title="No children linked to your account yet"
            description="Contact the school office to get your children linked."
          />
        )}
        {shown?.map((student, i) => (
          <ChildCard key={student.id} studentId={student.id} index={i} />
        ))}
        {students && students.length > MAX_CHILDREN_SHOWN && (
          <p className="text-center text-sm text-slate-500">
            Showing the first {MAX_CHILDREN_SHOWN} of {students.length}.
          </p>
        )}
      </div>
    </div>
  );
}
