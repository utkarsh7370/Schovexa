'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { createAcademicYearSchema, type CreateAcademicYearInput } from '@schovexa/validation';
import { Alert, Badge, Button, ConfirmDialog, Dialog, EmptyState, PageHeader, Skeleton, StatCard, TextField, useToast } from '@schovexa/ui';
import { CalendarClock, CalendarDays, CalendarPlus, CircleCheck, Star } from 'lucide-react';
import { useAcademicYears, ACADEMIC_YEARS_QUERY_KEY, type AcademicYear } from '../../../../hooks/useAcademicYears';
import { api, ApiError } from '../../../../lib/api-client';

const DAY_MS = 24 * 60 * 60 * 1000;

type Phase = 'ongoing' | 'upcoming' | 'ended';

function phaseOf(year: AcademicYear, now: number): Phase {
  if (now < new Date(year.startDate).getTime()) return 'upcoming';
  if (now > new Date(year.endDate).getTime() + DAY_MS) return 'ended';
  return 'ongoing';
}

const PHASE_BADGE: Record<Phase, { label: string; tone: 'success' | 'info' | 'neutral' }> = {
  ongoing: { label: 'In progress', tone: 'success' },
  upcoming: { label: 'Upcoming', tone: 'info' },
  ended: { label: 'Ended', tone: 'neutral' },
};

const PHASE_BAR: Record<Phase, string> = {
  ongoing: 'from-emerald-400 to-teal-500',
  upcoming: 'from-sky-400 to-blue-500',
  ended: 'from-slate-200 to-slate-300',
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function monthsBetween(start: string, end: string): number {
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / (30.44 * DAY_MS)));
}

export default function AcademicYearsPage() {
  const { data: years, isLoading, isError } = useAcademicYears();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<AcademicYear | null>(null);
  // Fixed per mount so a card never flips phase mid-render.
  const [now] = useState(() => Date.now());

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateAcademicYearInput>({ resolver: zodResolver(createAcademicYearSchema) });

  const closeForm = () => {
    setCreating(false);
    setServerError(null);
    reset();
  };

  const onCreate = async (data: CreateAcademicYearInput) => {
    setServerError(null);
    try {
      await api.post('/academic-years', data);
      await queryClient.invalidateQueries({ queryKey: ACADEMIC_YEARS_QUERY_KEY });
      closeForm();
      toast.show({ tone: 'success', title: `${data.name} created`, description: 'Add classes to it from the Classes page.' });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not create academic year.');
    }
  };

  const setCurrent = async () => {
    if (!confirming) return;
    setBusyId(confirming.id);
    try {
      await api.post(`/academic-years/${confirming.id}/set-current`);
      await queryClient.invalidateQueries({ queryKey: ACADEMIC_YEARS_QUERY_KEY });
      toast.show({ tone: 'success', title: `${confirming.name} is now the current year` });
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not change the current year', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusyId(null);
      setConfirming(null);
    }
  };

  const sorted = useMemo(() => [...(years ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate)), [years]);
  const current = years?.find((y) => y.isCurrent);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Teaching"
        title="Academic Years"
        description="The school years that classes, attendance and fee structures are organised under."
        action={
          <Button onClick={() => setCreating(true)}>
            <CalendarPlus size={16} /> New academic year
          </Button>
        }
      />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Academic years" tone="blue" icon={<CalendarDays size={18} />} value={years ? years.length : <Skeleton className="h-8 w-12" />} />
        <StatCard
          label="Current year"
          tone="emerald"
          icon={<Star size={18} />}
          value={years ? current?.name ?? 'None set' : <Skeleton className="h-8 w-24" />}
          hint={current ? `${fmt(current.startDate)} – ${fmt(current.endDate)}` : 'Choose one below'}
        />
        <StatCard
          label="Upcoming"
          tone="violet"
          icon={<CalendarClock size={18} />}
          value={years ? sorted.filter((y) => phaseOf(y, now) === 'upcoming').length : <Skeleton className="h-8 w-12" />}
          hint="Years that haven’t started yet"
        />
      </div>

      {current && phaseOf(current, now) === 'ended' && (
        <Alert variant="warning" className="mt-6">
          Your current academic year ({current.name}) ended on {fmt(current.endDate)}. Create the next year and make it current so new classes and fees go under it.
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
            action={<Button onClick={() => setCreating(true)}>Create the first academic year</Button>}
          />
        )}

        {sorted.length > 0 && (
          <ol className="relative flex flex-col gap-4 border-l-2 border-dashed border-slate-200 pl-6 sm:pl-8">
            {sorted.map((year, i) => {
              const phase = phaseOf(year, now);
              const start = new Date(year.startDate).getTime();
              const end = new Date(year.endDate).getTime();
              const elapsed = phase === 'ongoing' ? Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100))) : phase === 'ended' ? 100 : 0;
              return (
                <li key={year.id} className="relative animate-fade-in-up" style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}>
                  <span
                    className={[
                      'absolute -left-[2.05rem] top-7 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white sm:-left-[2.55rem]',
                      year.isCurrent ? 'bg-brand-gradient shadow-glow' : 'bg-slate-300',
                    ].join(' ')}
                    aria-hidden="true"
                  />
                  <article
                    className={[
                      'overflow-hidden rounded-2xl border bg-white shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated',
                      year.isCurrent ? 'border-brand-blue/40 ring-1 ring-brand-blue/20' : 'border-slate-200/80',
                    ].join(' ')}
                  >
                    <div className={['h-1.5 bg-gradient-to-r', year.isCurrent ? 'from-brand-electric via-brand-blue to-brand-violet' : PHASE_BAR[phase]].join(' ')} />
                    <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-xl font-extrabold tracking-tight text-navy">{year.name}</h2>
                          {year.isCurrent && (
                            <Badge tone="brand" pulse>
                              Current year
                            </Badge>
                          )}
                          <Badge tone={PHASE_BADGE[phase].tone}>{PHASE_BADGE[phase].label}</Badge>
                        </div>
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-sm text-slate-500">
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarDays size={14} /> {fmt(year.startDate)} – {fmt(year.endDate)}
                          </span>
                          <span>{monthsBetween(year.startDate, year.endDate)} months</span>
                        </p>
                      </div>
                      {year.isCurrent ? (
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue">
                          <CircleCheck size={18} /> Active for classes &amp; fees
                        </span>
                      ) : (
                        <Button size="sm" variant="secondary" loading={busyId === year.id} onClick={() => setConfirming(year)}>
                          <Star size={14} /> Make current
                        </Button>
                      )}
                    </div>
                    {phase === 'ongoing' && (
                      <div className="px-5 pb-5 sm:px-6 sm:pb-6">
                        <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                          <span>Year progress</span>
                          <span className="font-semibold text-navy">{elapsed}%</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={elapsed} aria-valuemin={0} aria-valuemax={100} aria-label={`${year.name} progress`}>
                          <div className="h-full rounded-full bg-gradient-to-r from-brand-electric to-brand-blue transition-all duration-1000" style={{ width: `${elapsed}%` }} />
                        </div>
                      </div>
                    )}
                  </article>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <Dialog
        open={creating}
        onClose={closeForm}
        size="lg"
        eyebrow={<span className="text-xs font-semibold uppercase tracking-wide text-brand-blue">New academic year</span>}
        title="Create an academic year"
        description="Name it the way your school does, then set when it starts and ends."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
            <Button type="submit" form="year-form" loading={isSubmitting}>
              Create year
            </Button>
          </>
        }
      >
        <form id="year-form" onSubmit={handleSubmit(onCreate)} className="flex flex-col gap-4" noValidate>
          {serverError && <Alert variant="error">{serverError}</Alert>}
          <TextField label="Name" placeholder="2026-27" leftIcon={<CalendarDays size={16} />} error={errors.name?.message} {...register('name')} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="Start date" type="date" error={errors.startDate?.message} {...register('startDate')} />
            <TextField label="End date" type="date" error={errors.endDate?.message} {...register('endDate')} />
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!confirming}
        title={`Make ${confirming?.name ?? 'this year'} the current year?`}
        description="Classes and fee structures open on the current year by default. Nothing is deleted from the previous year."
        confirmLabel="Make current"
        loading={busyId === confirming?.id}
        onConfirm={setCurrent}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
