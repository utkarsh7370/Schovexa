'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { HOLIDAY_TYPES, createHolidaySchema, type CreateHolidayInput } from '@schovexa/validation';
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  PageHeader,
  SearchInput,
  SelectField,
  Skeleton,
  StatCard,
  TextAreaField,
  TextField,
  useToast,
} from '@schovexa/ui';
import { CalendarDays, CalendarOff, CalendarPlus, Clock, PartyPopper, Pencil, SearchX, Sunrise, Trash2 } from 'lucide-react';
import { useHolidays, useNextHoliday, HOLIDAYS_QUERY_KEY, type Holiday, type HolidayType } from '../../../../hooks/useHolidays';
import { useCan } from '../../../../hooks/useCan';
import { api, ApiError } from '../../../../lib/api-client';
import { dateTile, dayCount, formatRange, HOLIDAY_TYPE_META, monthKey, monthTitle, statusOf, weekday, type HolidayStatus } from '../../../../lib/holiday-ui';

type View = 'upcoming' | 'past' | 'all';

const STATUS_BADGE: Record<HolidayStatus, { tone: 'success' | 'warning' | 'info' | 'neutral'; pulse?: boolean }> = {
  ongoing: { tone: 'success', pulse: true },
  today: { tone: 'success', pulse: true },
  soon: { tone: 'warning' },
  upcoming: { tone: 'info' },
  past: { tone: 'neutral' },
};

export default function HolidaysPage() {
  const { data: holidays, isLoading, isError } = useHolidays();
  const { data: next } = useNextHoliday();
  const { can } = useCan();
  const canCreate = can('holiday.create');
  const canUpdate = can('holiday.update');
  const canDelete = can('holiday.delete');
  const queryClient = useQueryClient();
  const toast = useToast();

  const [view, setView] = useState<View>('upcoming');
  const [type, setType] = useState<HolidayType | ''>('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Holiday | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Holiday | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  // The school's own "today" (from the server) decides upcoming vs past;
  // until it arrives, treat nothing as past so no card flashes "Past".
  const today = next?.today ?? '0000-00-00';
  const year = today.slice(0, 4);

  const all = useMemo(() => holidays ?? [], [holidays]);
  const thisYear = all.filter((h) => h.startDate.slice(0, 4) === year || h.endDate.slice(0, 4) === year);
  const daysOffThisYear = thisYear.reduce((sum, h) => sum + dayCount(h.startDate, h.endDate), 0);

  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return all
      .filter((h) => {
        const past = h.endDate < today;
        if (view === 'upcoming' && past) return false;
        if (view === 'past' && !past) return false;
        if (type && h.type !== type) return false;
        if (!words.length) return true;
        const haystack = `${h.name} ${h.description ?? ''} ${HOLIDAY_TYPE_META[h.type].label}`.toLowerCase();
        return words.every((w) => haystack.includes(w));
      })
      // Upcoming reads soonest-first; past reads most-recent-first.
      .sort((a, b) => (view === 'past' ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate)));
  }, [all, view, type, query, today]);

  const groups = useMemo(() => {
    const map = new Map<string, Holiday[]>();
    filtered.forEach((h) => map.set(monthKey(h.startDate), [...(map.get(monthKey(h.startDate)) ?? []), h]));
    return [...map.entries()];
  }, [filtered]);

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      await api.delete(`/holidays/${deleting.id}`);
      await queryClient.invalidateQueries({ queryKey: HOLIDAYS_QUERY_KEY });
      toast.show({ tone: 'success', title: `${deleting.name} deleted` });
      setDeleting(null);
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not delete the holiday', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusyDelete(false);
    }
  };

  const tabs: { id: View; label: string }[] = [
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'past', label: 'Past' },
    { id: 'all', label: 'All' },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Calendar"
        title="Holidays"
        description="Days the school is closed — public holidays, festivals and vacations."
        action={
          canCreate && (
            <Button onClick={() => setEditing('new')}>
              <CalendarPlus size={16} /> Add holiday
            </Button>
          )
        }
      />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Next holiday"
          tone="brand"
          icon={<PartyPopper size={18} />}
          value={next ? next.holiday?.name ?? 'None scheduled' : <Skeleton className="h-8 w-28 bg-white/30" />}
          hint={
            next?.holiday
              ? next.ongoing
                ? 'Happening now'
                : next.daysUntil === 1
                  ? 'Tomorrow'
                  : `In ${next.daysUntil} days · ${formatRange(next.holiday.startDate, next.holiday.endDate)}`
              : undefined
          }
        />
        <StatCard label={`Holidays in ${year === '0000' ? 'the year' : year}`} tone="violet" icon={<CalendarDays size={18} />} value={holidays ? thisYear.length : <Skeleton className="h-8 w-12" />} />
        <StatCard label="Days off this year" tone="emerald" icon={<Sunrise size={18} />} value={holidays ? daysOffThisYear : <Skeleton className="h-8 w-12" />} hint="Counting every day of each break" />
      </div>

      <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput className="flex-1" value={query} onChange={setQuery} placeholder="Search holidays by name or note…" aria-label="Search holidays" />
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Show holidays">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={view === t.id}
                onClick={() => setView(t.id)}
                className={['flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-all', view === t.id ? 'bg-white text-navy shadow-card' : 'text-slate-500 hover:text-navy'].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={type === ''}
            onClick={() => setType('')}
            className={['rounded-full px-3 py-1.5 text-xs font-semibold transition-colors', type === '' ? 'bg-navy text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'].join(' ')}
          >
            All types
          </button>
          {HOLIDAY_TYPES.map((t) => {
            const meta = HOLIDAY_TYPE_META[t];
            const Icon = meta.icon;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => setType(type === t ? '' : t)}
                className={['inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition-all', type === t ? `${meta.chip} shadow-card` : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50'].join(' ')}
              >
                <Icon size={13} /> {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        {isError && <Alert variant="error">We couldn’t load the holiday calendar. Please refresh and try again.</Alert>}
        {isLoading && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        )}
        {!isLoading && !isError && all.length === 0 && (
          <EmptyState
            icon={<CalendarOff size={22} />}
            title="No holidays on the calendar yet"
            description={canCreate ? 'Add the first one so everyone knows when school is closed.' : 'Nothing has been added yet. Check back soon.'}
            action={canCreate ? <Button onClick={() => setEditing('new')}>Add a holiday</Button> : undefined}
          />
        )}
        {all.length > 0 && filtered.length === 0 && (
          <EmptyState
            icon={<SearchX size={22} />}
            title={view === 'upcoming' ? 'No upcoming holidays match' : 'No holidays match'}
            description="Try another filter, or search for something else."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('');
                  setType('');
                  setView('all');
                }}
              >
                Show everything
              </Button>
            }
          />
        )}

        <div className="flex flex-col gap-8">
          {groups.map(([key, list]) => (
            <section key={key} aria-label={monthTitle(key)}>
              <h2 className="mb-3 flex items-center gap-3 text-sm font-bold uppercase tracking-wider text-slate-400">
                {monthTitle(key)}
                <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
              </h2>
              <ul className="flex flex-col gap-3">
                {list.map((h, i) => {
                  const meta = HOLIDAY_TYPE_META[h.type];
                  const Icon = meta.icon;
                  const tile = dateTile(h.startDate, h.endDate);
                  const days = dayCount(h.startDate, h.endDate);
                  const st = statusOf(h, today);
                  return (
                    <li
                      key={h.id}
                      className={[
                        'group animate-fade-in-up overflow-hidden rounded-2xl border bg-white shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated',
                        st.status === 'ongoing' || st.status === 'today' ? 'border-emerald-300/70 ring-1 ring-emerald-200' : 'border-slate-200/80',
                        st.status === 'past' ? 'opacity-75 hover:opacity-100' : '',
                      ].join(' ')}
                      style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                    >
                      <div className="flex items-stretch gap-4 p-4 sm:gap-5 sm:p-5">
                        <div className={['flex w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br py-3 text-white shadow-card transition-transform duration-300 group-hover:scale-105 sm:w-[4.5rem]', meta.tile].join(' ')}>
                          <span className="text-2xl font-extrabold leading-none tracking-tight sm:text-[1.65rem]">{tile.top}</span>
                          <span className="mt-1 text-[11px] font-bold uppercase tracking-wider text-white/85">{tile.bottom}</span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-base font-bold text-navy">{h.name}</h3>
                            <span className={['inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', meta.chip].join(' ')}>
                              <Icon size={11} /> {meta.label}
                            </span>
                          </div>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-500">
                            <span className="inline-flex items-center gap-1.5">
                              <CalendarDays size={14} /> {days === 1 ? `${weekday(h.startDate)}, ` : ''}
                              {formatRange(h.startDate, h.endDate)}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <Clock size={14} /> {days} {days === 1 ? 'day' : 'days'}
                            </span>
                          </p>
                          {h.description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{h.description}</p>}
                        </div>

                        <div className="flex shrink-0 flex-col items-end justify-between gap-3">
                          <Badge tone={STATUS_BADGE[st.status].tone} pulse={STATUS_BADGE[st.status].pulse} dot={!STATUS_BADGE[st.status].pulse}>
                            {st.label}
                          </Badge>
                          {(canUpdate || canDelete) && (
                            <div className="flex gap-1.5">
                              {canUpdate && (
                                <Button size="sm" variant="secondary" aria-label={`Edit ${h.name}`} onClick={() => setEditing(h)}>
                                  <Pencil size={14} />
                                  <span className="hidden sm:inline">Edit</span>
                                </Button>
                              )}
                              {canDelete && (
                                <Button size="sm" variant="soft-danger" aria-label={`Delete ${h.name}`} onClick={() => setDeleting(h)}>
                                  <Trash2 size={14} />
                                  <span className="hidden sm:inline">Delete</span>
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>

      <HolidayDialog open={editing !== null} holiday={editing && editing !== 'new' ? editing : undefined} onClose={() => setEditing(null)} />

      <ConfirmDialog
        open={!!deleting}
        title={`Delete “${deleting?.name ?? 'this holiday'}”?`}
        description="It will disappear from the calendar for everyone. This can’t be undone."
        confirmLabel="Delete holiday"
        tone="danger"
        loading={busyDelete}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

// One dialog for both adding and editing, so the two can't drift apart.
function HolidayDialog({ open, holiday, onClose }: { open: boolean; holiday?: Holiday; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const isEdit = !!holiday;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateHolidayInput>({
    resolver: zodResolver(createHolidaySchema),
    mode: 'onTouched',
    // Re-keyed on the holiday so reopening for a different one (or for
    // "new") starts from the right values.
    values: holiday
      ? { name: holiday.name, type: holiday.type, startDate: holiday.startDate, endDate: holiday.endDate, description: holiday.description ?? '' }
      : { name: '', type: 'FESTIVAL', startDate: '', endDate: '', description: '' },
  });

  const startDate = watch('startDate');
  const endDate = watch('endDate');
  const selectedType = watch('type') ?? 'OTHER';
  const days = startDate && endDate && endDate >= startDate ? dayCount(startDate, endDate) : null;

  const close = () => {
    setServerError(null);
    reset();
    onClose();
  };

  const onSubmit = async (data: CreateHolidayInput) => {
    setServerError(null);
    try {
      if (holiday) await api.patch(`/holidays/${holiday.id}`, data);
      else await api.post('/holidays', data);
      await queryClient.invalidateQueries({ queryKey: HOLIDAYS_QUERY_KEY });
      toast.show({ tone: 'success', title: holiday ? `${data.name} updated` : `${data.name} added`, description: 'Everyone can see it on the calendar now.' });
      close();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : `Could not ${isEdit ? 'save' : 'add'} the holiday.`);
    }
  };

  const meta = HOLIDAY_TYPE_META[selectedType];
  const Icon = meta.icon;

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      eyebrow={<span className="text-xs font-semibold uppercase tracking-wide text-brand-blue">{isEdit ? 'Edit holiday' : 'New holiday'}</span>}
      title={isEdit ? `Edit ${holiday.name}` : 'Add a holiday'}
      description="Parents, teachers and staff will see it on the calendar and on their dashboard."
      footer={
        <>
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="holiday-form" loading={isSubmitting}>
            {isEdit ? 'Save changes' : 'Add holiday'}
          </Button>
        </>
      }
    >
      <form id="holiday-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {serverError && <Alert variant="error">{serverError}</Alert>}
        <TextField label="Name" placeholder="Diwali break" leftIcon={<Icon size={16} />} error={errors.name?.message} {...register('name')} />
        <SelectField label="Type" error={errors.type?.message} {...register('type')}>
          {HOLIDAY_TYPES.map((t) => (
            <option key={t} value={t}>
              {HOLIDAY_TYPE_META[t].label}
            </option>
          ))}
        </SelectField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Starts on"
            type="date"
            error={errors.startDate?.message}
            {...register('startDate', {
              // Picking a start moves an empty or now-earlier end date along
              // with it — the usual case is a single day.
              onChange: (e) => {
                const value = e.target.value as string;
                if (value && (!endDate || endDate < value)) setValue('endDate', value, { shouldValidate: false });
              },
            })}
          />
          <TextField label="Ends on" type="date" min={startDate || undefined} helperText={days ? `${days} ${days === 1 ? 'day' : 'days'} in total` : 'Same as the start date for one day.'} error={errors.endDate?.message} {...register('endDate')} />
        </div>
        <TextAreaField label="Note (optional)" rows={3} maxLength={500} placeholder="Anything parents or staff should know — e.g. school reopens on Monday." error={errors.description?.message} {...register('description')} />
      </form>
    </Dialog>
  );
}
