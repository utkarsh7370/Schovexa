'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { createAcademicYearSchema, type CreateAcademicYearInput } from '@schovexa/validation';
import { Alert, Badge, Button, ConfirmDialog, Dialog, EmptyState, PageHeader, Skeleton, StatCard, TextAreaField, TextField, useToast, type BadgeTone } from '@schovexa/ui';
import {
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  CircleCheck,
  History,
  Hourglass,
  MessageSquareText,
  Pencil,
  Send,
  Star,
  ThumbsUp,
  UserRound,
  XCircle,
  CalendarRange,
} from 'lucide-react';
import { TermsPanel } from '../../../../components/terms-panel';
import {
  ACADEMIC_YEARS_QUERY_KEY,
  ACADEMIC_YEAR_ATTENTION_QUERY_KEY,
  academicYearReviewsQueryKey,
  useAcademicYearReviews,
  useAcademicYears,
  type AcademicYear,
  type AcademicYearReviewAction,
  type AcademicYearStatus,
} from '../../../../hooks/useAcademicYears';
import { NOTIFICATIONS_QUERY_KEY } from '../../../../hooks/useNotices';
import { useCan } from '../../../../hooks/useCan';
import { api, ApiError } from '../../../../lib/api-client';
import { applyServerErrors } from '../../../../lib/forms';

const DAY_MS = 24 * 60 * 60 * 1000;

type Phase = 'ongoing' | 'upcoming' | 'ended';

// Years are stored as midnight-UTC calendar dates, so read them in UTC —
// in a time zone behind UTC, local formatting would show the day before.
const parse = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
const fmt = (iso: string) => parse(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const dayInput = (iso: string) => iso.slice(0, 10);

function phaseOf(year: AcademicYear, now: number): Phase {
  if (now < parse(year.startDate).getTime()) return 'upcoming';
  if (now > parse(year.endDate).getTime() + DAY_MS) return 'ended';
  return 'ongoing';
}

function monthsBetween(start: string, end: string): number {
  return Math.max(1, Math.round((parse(end).getTime() - parse(start).getTime()) / (30.44 * DAY_MS)));
}

const STATUS_BADGE: Record<AcademicYearStatus, { label: string; tone: BadgeTone }> = {
  PENDING_APPROVAL: { label: 'Awaiting approval', tone: 'warning' },
  CHANGES_REQUESTED: { label: 'Changes suggested', tone: 'info' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  APPROVED: { label: 'Approved', tone: 'success' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
};

const STATUS_BAR: Record<AcademicYearStatus, string> = {
  PENDING_APPROVAL: 'from-amber-300 to-orange-400',
  CHANGES_REQUESTED: 'from-sky-400 to-indigo-500',
  REJECTED: 'from-rose-400 to-red-500',
  APPROVED: 'from-emerald-400 to-teal-500',
  EXPIRED: 'from-slate-200 to-slate-300',
};

const ACTION_LABEL: Record<AcademicYearReviewAction, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  SUBMITTED: { label: 'Proposed', tone: 'bg-amber-100 text-amber-700', icon: Send },
  RESUBMITTED: { label: 'Resubmitted', tone: 'bg-amber-100 text-amber-700', icon: Send },
  APPROVED: { label: 'Approved', tone: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', tone: 'bg-red-100 text-red-700', icon: XCircle },
  CHANGES_REQUESTED: { label: 'Changes suggested', tone: 'bg-sky-100 text-sky-700', icon: MessageSquareText },
  EXPIRED: { label: 'Expired', tone: 'bg-slate-100 text-slate-600', icon: Hourglass },
};

type DecisionKind = 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT';

export default function AcademicYearsPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <AcademicYearsContent />
    </Suspense>
  );
}

function AcademicYearsContent() {
  const { data: years, isLoading, isError } = useAcademicYears();
  const { can } = useCan();
  const queryClient = useQueryClient();
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const handledLink = useRef<string | null>(null);
  const canApprove = can('academicYear.approve');
  const canCreate = can('academicYear.create');
  const canUpdate = can('academicYear.update');

  const [formYear, setFormYear] = useState<AcademicYear | 'new' | null>(null); // create or edit
  const [busyId, setBusyId] = useState<string | null>(null);
  const [makingCurrent, setMakingCurrent] = useState<AcademicYear | null>(null);
  const [reviewing, setReviewing] = useState<AcademicYear | null>(null);
  const [resubmitting, setResubmitting] = useState<AcademicYear | null>(null);
  const [historyOpen, setHistoryOpen] = useState<Set<string>>(new Set());
  // Fixed per mount so a card never flips phase mid-render.
  const [now] = useState(() => Date.now());

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ACADEMIC_YEARS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ACADEMIC_YEAR_ATTENTION_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
    ]);
  };

  // Arriving from the dashboard card ("Review" / "Edit & resubmit") opens the
  // right dialog — once. The link is then dropped from the URL, otherwise the
  // dialog would pop open again every time the list refreshes.
  const reviewParam = params.get('review');
  const editParam = params.get('edit');
  useEffect(() => {
    const link = reviewParam ? `review:${reviewParam}` : editParam ? `edit:${editParam}` : null;
    if (!years || !link || handledLink.current === link) return;
    if (reviewParam && canApprove) {
      const year = years.find((y) => y.id === reviewParam && y.status === 'PENDING_APPROVAL');
      if (year) setReviewing(year);
    } else if (editParam) {
      const year = years.find((y) => y.id === editParam && y.status === 'CHANGES_REQUESTED');
      if (year) setFormYear(year);
    }
    handledLink.current = link;
    router.replace('/dashboard/academic-years');
  }, [years, reviewParam, editParam, canApprove, router]);

  const sorted = useMemo(() => [...(years ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate)), [years]);
  const current = years?.find((y) => y.isCurrent);
  const pendingCount = years?.filter((y) => y.status === 'PENDING_APPROVAL').length ?? 0;

  const setCurrent = async () => {
    if (!makingCurrent) return;
    setBusyId(makingCurrent.id);
    try {
      await api.post(`/academic-years/${makingCurrent.id}/set-current`);
      await refresh();
      toast.show({ tone: 'success', title: `${makingCurrent.name} is now the current year` });
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not change the current year', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusyId(null);
      setMakingCurrent(null);
    }
  };

  const toggleHistory = (id: string) =>
    setHistoryOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Teaching"
        title="Academic Years"
        description="The school years that classes, attendance and fee structures are organised under."
        action={
          canCreate && (
            <Button onClick={() => setFormYear('new')}>
              <CalendarPlus size={16} /> {canApprove ? 'New academic year' : 'Propose a year'}
            </Button>
          )
        }
      />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Academic years" tone="blue" icon={<CalendarDays size={18} />} value={years ? years.length : <Skeleton className="h-8 w-12" />} />
        <StatCard
          label="Current year"
          tone="emerald"
          icon={<Star size={18} />}
          value={years ? current?.name ?? 'None set' : <Skeleton className="h-8 w-24" />}
          hint={current ? `${fmt(current.startDate)} – ${fmt(current.endDate)}` : 'Approve a year to start one'}
        />
        <StatCard
          label="Awaiting approval"
          tone={pendingCount > 0 ? 'amber' : 'violet'}
          icon={<Hourglass size={18} />}
          value={years ? pendingCount : <Skeleton className="h-8 w-12" />}
          hint={canApprove ? (pendingCount > 0 ? 'Needs your decision' : 'Nothing to review') : 'Waiting for the Director'}
        />
      </div>

      {years && !current && years.length > 0 && (
        <Alert variant="warning" className="mt-6">
          There is no current academic year — the last one has ended. {canApprove ? 'Create the next year (or approve a proposed one)' : 'Propose the next year'} so new classes and fees have somewhere to go.
        </Alert>
      )}

      {canCreate && !canApprove && (
        <Alert variant="info" className="mt-6">
          A year you propose is sent to the Director for approval. You’ll be notified when they approve it, suggest changes or reject it.
        </Alert>
      )}

      <div className="mt-8">
        {isError && <Alert variant="error">We couldn’t load academic years. Please refresh and try again.</Alert>}
        {isLoading && (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
        )}
        {!isLoading && !isError && years?.length === 0 && (
          <EmptyState
            icon={<CalendarDays size={22} />}
            title="No academic years yet"
            description="Create one to start organising classes and fee structures."
            action={canCreate ? <Button onClick={() => setFormYear('new')}>{canApprove ? 'Create the first academic year' : 'Propose the first year'}</Button> : undefined}
          />
        )}

        {sorted.length > 0 && (
          <ol className="relative flex flex-col gap-4 border-l-2 border-dashed border-slate-200 pl-6 sm:pl-8">
            {sorted.map((year, i) => (
              <YearCard
                key={year.id}
                year={year}
                index={i}
                now={now}
                busy={busyId === year.id}
                canApprove={canApprove}
                canCreate={canCreate}
                canUpdate={canUpdate}
                historyOpen={historyOpen.has(year.id)}
                onToggleHistory={() => toggleHistory(year.id)}
                onMakeCurrent={() => setMakingCurrent(year)}
                onEdit={() => setFormYear(year)}
                onReview={() => setReviewing(year)}
                onResubmit={() => setResubmitting(year)}
              />
            ))}
          </ol>
        )}
      </div>

      <YearFormDialog
        year={formYear}
        proposing={!canApprove}
        onClose={() => setFormYear(null)}
        onSaved={async (message) => {
          await refresh();
          setFormYear(null);
          toast.show({ tone: 'success', title: message.title, description: message.description });
        }}
      />

      <ReviewDialog
        year={reviewing}
        onClose={() => setReviewing(null)}
        onDone={async (title) => {
          await refresh();
          setReviewing(null);
          toast.show({ tone: 'success', title });
        }}
      />

      <ResubmitDialog
        year={resubmitting}
        onClose={() => setResubmitting(null)}
        onDone={async (name) => {
          await refresh();
          setResubmitting(null);
          toast.show({ tone: 'success', title: `${name} sent for approval again` });
        }}
      />

      <ConfirmDialog
        open={!!makingCurrent}
        title={`Make ${makingCurrent?.name ?? 'this year'} the current year?`}
        description="Classes and fee structures open on the current year by default. Nothing is deleted from the previous year."
        confirmLabel="Make current"
        loading={busyId === makingCurrent?.id}
        onConfirm={setCurrent}
        onCancel={() => setMakingCurrent(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

interface YearCardProps {
  year: AcademicYear;
  index: number;
  now: number;
  busy: boolean;
  canApprove: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  historyOpen: boolean;
  onToggleHistory: () => void;
  onMakeCurrent: () => void;
  onEdit: () => void;
  onReview: () => void;
  onResubmit: () => void;
}

function YearCard({ year, index, now, busy, canApprove, canCreate, canUpdate, historyOpen, onToggleHistory, onMakeCurrent, onEdit, onReview, onResubmit }: YearCardProps) {
  const [termsOpen, setTermsOpen] = useState(false);
  const status = STATUS_BADGE[year.status];
  const phase = phaseOf(year, now);
  const approved = year.status === 'APPROVED';
  const start = parse(year.startDate).getTime();
  const end = parse(year.endDate).getTime();
  const elapsed = approved && phase === 'ongoing' ? Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100))) : 0;
  const dim = year.status === 'EXPIRED' || year.status === 'REJECTED';

  return (
    <li className="relative animate-fade-in-up" style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}>
      <span
        className={['absolute -left-[2.05rem] top-7 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white sm:-left-[2.55rem]', year.isCurrent ? 'bg-brand-gradient shadow-glow' : dim ? 'bg-slate-200' : 'bg-slate-300'].join(' ')}
        aria-hidden="true"
      />
      <article
        className={[
          'overflow-hidden rounded-2xl border bg-white shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated',
          year.isCurrent ? 'border-brand-blue/40 ring-1 ring-brand-blue/20' : year.status === 'PENDING_APPROVAL' ? 'border-amber-300' : 'border-slate-200/80',
          dim ? 'opacity-90' : '',
        ].join(' ')}
      >
        <div className={['h-1.5 bg-gradient-to-r', year.isCurrent ? 'from-brand-electric via-brand-blue to-brand-violet' : STATUS_BAR[year.status]].join(' ')} />
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-extrabold tracking-tight text-navy">{year.name}</h2>
              {year.isCurrent && (
                <Badge tone="brand" pulse>
                  Current year
                </Badge>
              )}
              <Badge tone={status.tone} dot pulse={year.status === 'PENDING_APPROVAL'}>
                {status.label}
              </Badge>
              {approved && !year.isCurrent && phase === 'upcoming' && <Badge tone="info">Upcoming</Badge>}
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays size={14} /> {fmt(year.startDate)} – {fmt(year.endDate)}
              </span>
              <span>{monthsBetween(year.startDate, year.endDate)} months</span>
              {year.createdBy && (
                <span className="inline-flex items-center gap-1.5">
                  <UserRound size={14} /> Proposed by {year.createdBy.name}
                </span>
              )}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {year.status === 'PENDING_APPROVAL' && canApprove && (
              <Button size="sm" onClick={onReview}>
                <ThumbsUp size={14} /> Review
              </Button>
            )}
            {(year.status === 'PENDING_APPROVAL' || year.status === 'CHANGES_REQUESTED') && canUpdate && (
              <Button size="sm" variant="secondary" onClick={onEdit}>
                <Pencil size={14} /> Edit
              </Button>
            )}
            {year.status === 'CHANGES_REQUESTED' && canCreate && (
              <Button size="sm" onClick={onResubmit}>
                <Send size={14} /> Resubmit
              </Button>
            )}
            {approved && year.isCurrent && (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue">
                <CircleCheck size={18} /> Active for classes &amp; fees
              </span>
            )}
            {approved && !year.isCurrent && canUpdate && (
              <Button size="sm" variant="secondary" loading={busy} onClick={onMakeCurrent}>
                <Star size={14} /> Make current
              </Button>
            )}
            {year.status === 'PENDING_APPROVAL' && !canApprove && <span className="text-xs font-semibold text-amber-700">Waiting for the Director</span>}
          </div>
        </div>

        {year.decisionNote && (year.status === 'CHANGES_REQUESTED' || year.status === 'REJECTED' || year.status === 'APPROVED') && (
          <div
            className={[
              'mx-5 mb-4 rounded-xl p-3.5 text-sm sm:mx-6',
              year.status === 'REJECTED' ? 'bg-red-50 text-red-900' : year.status === 'CHANGES_REQUESTED' ? 'bg-sky-50 text-sky-900' : 'bg-emerald-50 text-emerald-900',
            ].join(' ')}
          >
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider opacity-70">
              <MessageSquareText size={13} /> {year.decidedBy?.name ?? 'Director'} says
            </p>
            <p className="mt-1 whitespace-pre-wrap">{year.decisionNote}</p>
          </div>
        )}

        {approved && phase === 'ongoing' && (
          <div className="px-5 pb-4 sm:px-6">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Year progress</span>
              <span className="font-semibold text-navy">{elapsed}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={elapsed} aria-valuemin={0} aria-valuemax={100} aria-label={`${year.name} progress`}>
              <div className="h-full rounded-full bg-gradient-to-r from-brand-electric to-brand-blue transition-all duration-1000" style={{ width: `${elapsed}%` }} />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-5 border-t border-slate-100 px-5 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={() => setTermsOpen((v) => !v)}
            aria-expanded={termsOpen}
            className="inline-flex items-center gap-1.5 rounded-lg py-1 text-xs font-semibold text-slate-500 transition-colors hover:text-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          >
            <CalendarRange size={14} /> {termsOpen ? 'Hide terms' : 'Terms'}
          </button>
          <button
            type="button"
            onClick={onToggleHistory}
            aria-expanded={historyOpen}
            className="inline-flex items-center gap-1.5 rounded-lg py-1 text-xs font-semibold text-slate-500 transition-colors hover:text-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          >
            <History size={14} /> {historyOpen ? 'Hide history' : 'Show history'}
          </button>
        </div>
        {termsOpen && <TermsPanel yearId={year.id} yearName={year.name} canEdit={canUpdate && year.status !== 'REJECTED'} />}
        <div className={['grid transition-[grid-template-rows,visibility] duration-300 ease-out', historyOpen ? 'visible grid-rows-[1fr]' : 'invisible grid-rows-[0fr]'].join(' ')}>
          <div className="overflow-hidden">{historyOpen && <HistoryTimeline yearId={year.id} />}</div>
        </div>
      </article>
    </li>
  );
}

function HistoryTimeline({ yearId }: { yearId: string }) {
  const { data: reviews, isLoading, isError } = useAcademicYearReviews(yearId, true);
  return (
    <div className="bg-slate-50/70 px-5 pb-5 pt-3 sm:px-6">
      {isLoading && <Skeleton className="h-16 rounded-xl" />}
      {isError && <p className="text-sm text-red-600">Couldn’t load the history.</p>}
      {reviews && reviews.length === 0 && <p className="text-sm text-slate-500">No history yet.</p>}
      <ol className="space-y-3">
        {reviews?.map((r) => {
          const meta = ACTION_LABEL[r.action];
          return (
            <li key={r.id} className="flex gap-3">
              <span className={['mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', meta.tone].join(' ')}>
                <meta.icon size={14} />
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-navy">
                  {meta.label}
                  <span className="font-normal text-slate-500"> · {r.actor?.name ?? 'Schovexa'} · {fmtDateTime(r.createdAt)}</span>
                </p>
                {r.note && <p className="mt-0.5 whitespace-pre-wrap text-slate-600">{r.note}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------

function YearFormDialog({
  year,
  proposing,
  onClose,
  onSaved,
}: {
  year: AcademicYear | 'new' | null;
  proposing: boolean;
  onClose: () => void;
  onSaved: (message: { title: string; description: string }) => Promise<void>;
}) {
  const editing = year && year !== 'new' ? year : null;
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateAcademicYearInput>({ resolver: zodResolver(createAcademicYearSchema), defaultValues: { name: '', startDate: '', endDate: '' } });

  useEffect(() => {
    if (year === null) return;
    setServerError(null);
    reset(editing ? { name: editing.name, startDate: dayInput(editing.startDate), endDate: dayInput(editing.endDate) } : { name: '', startDate: '', endDate: '' });
  }, [year, editing, reset]);

  const close = () => {
    setServerError(null);
    onClose();
  };

  const onSubmit = async (data: CreateAcademicYearInput) => {
    setServerError(null);
    try {
      if (editing) {
        await api.patch(`/academic-years/${editing.id}`, data);
        await onSaved({ title: `${data.name} updated`, description: editing.status === 'CHANGES_REQUESTED' ? 'Resubmit it when you’re ready.' : 'The Director will see the new dates.' });
      } else {
        await api.post('/academic-years', data);
        await onSaved(
          proposing
            ? { title: `${data.name} sent for approval`, description: 'The Director has been notified and will review it.' }
            : { title: `${data.name} created`, description: 'Add classes to it from the Classes page.' },
        );
      }
    } catch (err) {
      setServerError(applyServerErrors(err, setError, { fallback: 'Could not save the academic year.' }));
    }
  };

  return (
    <Dialog
      open={year !== null}
      onClose={close}
      size="lg"
      eyebrow={<span className="text-xs font-semibold uppercase tracking-wide text-brand-blue">{editing ? 'Edit proposal' : proposing ? 'Propose an academic year' : 'New academic year'}</span>}
      title={editing ? `Edit ${editing.name}` : proposing ? 'Propose an academic year' : 'Create an academic year'}
      description={
        proposing || editing
          ? 'The Director reviews it before it can be used for classes and fees.'
          : 'Name it the way your school does, then set when it starts and ends.'
      }
      footer={
        <>
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="year-form" loading={isSubmitting}>
            {editing ? 'Save changes' : proposing ? 'Send for approval' : 'Create year'}
          </Button>
        </>
      }
    >
      <form id="year-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {serverError && <Alert variant="error">{serverError}</Alert>}
        <TextField label="Name" placeholder="2027-28" leftIcon={<CalendarDays size={16} />} error={errors.name?.message} {...register('name')} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Start date" type="date" error={errors.startDate?.message} {...register('startDate')} />
          <TextField label="End date" type="date" error={errors.endDate?.message} {...register('endDate')} />
        </div>
      </form>
    </Dialog>
  );
}

// The Director's decision: three clear choices and a note. Approving may
// carry a comment; the other two must say why.
function ReviewDialog({ year, onClose, onDone }: { year: AcademicYear | null; onClose: () => void; onDone: (title: string) => Promise<void> }) {
  const [kind, setKind] = useState<DecisionKind>('APPROVE');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (year) {
      setKind('APPROVE');
      setNote('');
      setError(null);
      setNoteError(null);
    }
  }, [year]);

  const choices: { kind: DecisionKind; title: string; text: string; icon: typeof CheckCircle2; tone: string; ring: string }[] = [
    { kind: 'APPROVE', title: 'Approve', text: 'It becomes usable for classes and fees.', icon: CheckCircle2, tone: 'text-emerald-600 bg-emerald-50', ring: 'ring-emerald-400 border-emerald-300' },
    { kind: 'REQUEST_CHANGES', title: 'Suggest changes', text: 'Send it back with your suggestions.', icon: MessageSquareText, tone: 'text-sky-600 bg-sky-50', ring: 'ring-sky-400 border-sky-300' },
    { kind: 'REJECT', title: 'Reject', text: 'Close this proposal with a reason.', icon: XCircle, tone: 'text-red-600 bg-red-50', ring: 'ring-red-400 border-red-300' },
  ];

  const submit = async () => {
    if (!year) return;
    setError(null);
    if (kind !== 'APPROVE' && note.trim().length < 3) {
      setNoteError('Tell the Principal why (at least 3 characters).');
      return;
    }
    setNoteError(null);
    setSaving(true);
    try {
      const path = kind === 'APPROVE' ? 'approve' : kind === 'REJECT' ? 'reject' : 'request-changes';
      await api.post(`/academic-years/${year.id}/${path}`, { note: note.trim() });
      await queryClient.invalidateQueries({ queryKey: academicYearReviewsQueryKey(year.id) });
      await onDone(kind === 'APPROVE' ? `${year.name} approved` : kind === 'REJECT' ? `${year.name} rejected` : `Suggestions sent for ${year.name}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your decision.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={!!year}
      onClose={onClose}
      size="lg"
      eyebrow={<span className="text-xs font-semibold uppercase tracking-wide text-brand-blue">Review proposal</span>}
      title={year ? `Review ${year.name}` : 'Review'}
      description={year ? `${fmt(year.startDate)} – ${fmt(year.endDate)} · proposed by ${year.createdBy?.name ?? 'a team member'}` : undefined}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant={kind === 'REJECT' ? 'danger' : 'primary'} loading={saving} onClick={submit}>
            {kind === 'APPROVE' ? 'Approve year' : kind === 'REJECT' ? 'Reject proposal' : 'Send suggestions'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}
        <fieldset>
          <legend className="sr-only">Your decision</legend>
          <div className="grid gap-3 sm:grid-cols-3" role="radiogroup">
            {choices.map((c) => {
              const active = kind === c.kind;
              return (
                <button
                  key={c.kind}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setKind(c.kind)}
                  className={[
                    'flex flex-col items-start gap-2 rounded-2xl border bg-white p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue',
                    active ? `ring-2 ${c.ring} shadow-card` : 'border-slate-200 hover:-translate-y-0.5 hover:border-slate-300',
                  ].join(' ')}
                >
                  <span className={['flex h-9 w-9 items-center justify-center rounded-xl', c.tone].join(' ')}>
                    <c.icon size={18} />
                  </span>
                  <span className="text-sm font-bold text-navy">{c.title}</span>
                  <span className="text-xs text-slate-500">{c.text}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
        <TextAreaField
          label={kind === 'APPROVE' ? 'Comment (optional)' : kind === 'REJECT' ? 'Reason for rejecting' : 'Your suggestions'}
          rows={4}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setNoteError(null);
          }}
          placeholder={kind === 'APPROVE' ? 'Anything the Principal should know?' : kind === 'REJECT' ? 'Why is this year not acceptable?' : 'What should change before you can approve it?'}
          error={noteError ?? undefined}
        />
      </div>
    </Dialog>
  );
}

function ResubmitDialog({ year, onClose, onDone }: { year: AcademicYear | null; onClose: () => void; onDone: (name: string) => Promise<void> }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (year) {
      setNote('');
      setError(null);
    }
  }, [year]);

  const submit = async () => {
    if (!year) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/academic-years/${year.id}/resubmit`, { note: note.trim() });
      await onDone(year.name);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resubmit.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={!!year}
      onClose={onClose}
      eyebrow={<span className="text-xs font-semibold uppercase tracking-wide text-brand-blue">Resubmit</span>}
      title={year ? `Send ${year.name} for approval again` : 'Resubmit'}
      description="The Director will be notified. Tell them what you changed."
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" loading={saving} onClick={submit}>
            <Send size={15} /> Resubmit
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}
        {year?.decisionNote && (
          <div className="rounded-xl bg-sky-50 p-3.5 text-sm text-sky-900">
            <p className="text-xs font-bold uppercase tracking-wider opacity-70">The Director suggested</p>
            <p className="mt-1 whitespace-pre-wrap">{year.decisionNote}</p>
          </div>
        )}
        <TextAreaField label="What did you change? (optional)" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Moved the start date to 1 April." />
      </div>
    </Dialog>
  );
}
