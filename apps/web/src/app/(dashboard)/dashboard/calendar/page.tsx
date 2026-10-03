'use client';

import { useMemo, useState } from 'react';
import { Alert, Badge, Button, PageHeader, Skeleton, StatCard } from '@schovexa/ui';
import { CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Clock, PartyPopper, Sun } from 'lucide-react';
import { useCalendar, type CalendarDay } from '../../../../hooks/useCalendar';
import { CalendarAgenda } from '../../../../components/teaching/calendar-agenda';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n: number) => String(n).padStart(2, '0');
const monthStart = (year: number, month: number) => `${year}-${pad(month + 1)}-01`;
const monthEnd = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);

// What each kind of day looks like — the legend uses the same classes.
const KIND = {
  working: { label: 'Working day', cell: 'bg-white hover:border-brand-blue/40', dot: 'bg-emerald-500' },
  weekly: { label: 'Weekly off', cell: 'bg-slate-100 text-slate-400', dot: 'bg-slate-400' },
  saturday: { label: 'Saturday off', cell: 'bg-amber-50 text-amber-700', dot: 'bg-amber-400' },
  holiday: { label: 'Holiday', cell: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
} as const;

function kindOf(day: CalendarDay): keyof typeof KIND {
  if (day.reason === 'HOLIDAY') return 'holiday';
  if (day.reason === 'OFF_SATURDAY') return 'saturday';
  if (day.reason === 'WEEKLY_OFF') return day.holidays.length ? 'holiday' : 'weekly';
  return 'working';
}

export default function CalendarPage() {
  // Start on the school's own current month once it has told us what "today" is.
  const [offset, setOffset] = useState<{ year: number; month: number } | null>(null);
  const first = useCalendar(offset ? monthStart(offset.year, offset.month) : undefined, offset ? monthEnd(offset.year, offset.month) : undefined);
  const data = first.data;
  const year = offset?.year ?? (data ? Number(data.from.slice(0, 4)) : new Date().getFullYear());
  const month = offset?.month ?? (data ? Number(data.from.slice(5, 7)) - 1 : new Date().getMonth());
  const [selected, setSelected] = useState<string | null>(null);

  const go = (delta: number) => {
    const d = new Date(Date.UTC(year, month + delta, 1));
    setOffset({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
    setSelected(null);
  };

  // Blank cells before the 1st so the weekdays line up (Monday first).
  const lead = data ? (new Date(`${data.from}T00:00:00Z`).getUTCDay() + 6) % 7 : 0;
  const byDate = useMemo(() => new Map((data?.days ?? []).map((d) => [d.date, d])), [data]);
  const selectedDay = selected ? byDate.get(selected) : undefined;
  const termOn = (date: string) => data?.terms.find((t) => t.startDate <= date && t.endDate >= date);
  const yearOn = (date: string) => data?.years.find((y) => y.startDate <= date && y.endDate >= date);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader eyebrow="Calendar" title="School calendar" description="Working days, weekly offs, Saturdays off and holidays — the same week your attendance follows." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Working days" tone="emerald" icon={<CalendarCheck size={18} />} value={data ? data.summary.workingDays : <Skeleton className="h-8 w-12" />} hint={`in ${MONTHS[month]}`} />
        <StatCard label="Holidays" tone="violet" icon={<PartyPopper size={18} />} value={data ? data.summary.holidays : <Skeleton className="h-8 w-12" />} hint="on working days" />
        <StatCard label="School day" tone="blue" icon={<Sun size={18} />} value={data ? `${data.timings.schoolStartTime}–${data.timings.schoolEndTime}` : <Skeleton className="h-8 w-24" />} hint={data?.timings.breakStartTime ? `Break ${data.timings.breakStartTime}–${data.timings.breakEndTime}` : 'No break set'} />
      </div>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-6" aria-label="Calendar">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-navy" aria-live="polite">{MONTHS[month]} {year}</h2>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" aria-label="Previous month" onClick={() => go(-1)}><ChevronLeft size={16} /></Button>
            <Button variant="secondary" size="sm" onClick={() => { setOffset(null); setSelected(null); }}>Today</Button>
            <Button variant="secondary" size="sm" aria-label="Next month" onClick={() => go(1)}><ChevronRight size={16} /></Button>
          </div>
        </div>

        {first.isError && <Alert variant="error">We couldn’t load the calendar. Please refresh and try again.</Alert>}
        {!data && !first.isError && <Skeleton className="h-96 rounded-xl" />}

        {data && (
          <>
            <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-bold uppercase tracking-wide text-slate-400">
              {WEEKDAYS.map((d) => <div key={d} className="py-1">{d}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1.5">
              {Array.from({ length: lead }).map((_, i) => <div key={`lead-${i}`} aria-hidden="true" />)}
              {data.days.map((day) => {
                const kind = kindOf(day);
                const isToday = day.date === data.today;
                const isSelected = selected === day.date;
                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => setSelected(isSelected ? null : day.date)}
                    aria-pressed={isSelected}
                    aria-label={`${day.date}: ${KIND[kind].label}${day.holidays.length ? `, ${day.holidays.map((h) => h.name).join(', ')}` : ''}${isToday ? ', today' : ''}`}
                    className={['relative flex min-h-[3.5rem] flex-col items-start rounded-xl border p-1.5 text-left text-sm transition-all sm:min-h-[4.5rem] sm:p-2', KIND[kind].cell, isToday ? 'border-brand-blue ring-2 ring-brand-blue/30' : 'border-slate-200', isSelected ? 'shadow-elevated ring-2 ring-navy/30' : ''].join(' ')}
                  >
                    <span className={['text-sm font-bold', isToday ? 'text-brand-blue' : ''].join(' ')}>{Number(day.date.slice(8))}</span>
                    {day.holidays[0] && <span className="mt-auto hidden w-full truncate text-[10px] font-semibold leading-tight sm:block">{day.holidays[0].name}</span>}
                    {day.holidays[0] && <span className="mt-auto h-1.5 w-1.5 rounded-full bg-rose-500 sm:hidden" />}
                  </button>
                );
              })}
            </div>

            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500" aria-label="Legend">
              {Object.values(KIND).map((k) => (
                <li key={k.label} className="inline-flex items-center gap-1.5"><span className={['h-2.5 w-2.5 rounded-full', k.dot].join(' ')} /> {k.label}</li>
              ))}
            </ul>

            {selectedDay && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm" role="status">
                <p className="font-bold text-navy">{new Date(`${selectedDay.date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-slate-600">
                  <Badge tone={selectedDay.working ? 'success' : selectedDay.reason === 'HOLIDAY' ? 'danger' : 'neutral'} dot>{selectedDay.working ? 'Working day' : KIND[kindOf(selectedDay)].label}</Badge>
                  {selectedDay.working && <span className="inline-flex items-center gap-1"><Clock size={13} /> {data.timings.schoolStartTime}–{data.timings.schoolEndTime}</span>}
                  {termOn(selectedDay.date) && <Badge tone="brand">{termOn(selectedDay.date)!.name}</Badge>}
                  {yearOn(selectedDay.date) && <span className="text-xs text-slate-500">{yearOn(selectedDay.date)!.name}</span>}
                </p>
                {selectedDay.holidays.map((h) => <p key={h.id} className="mt-1 text-slate-700"><PartyPopper size={13} className="mr-1 inline text-rose-500" /> {h.name}</p>)}
              </div>
            )}
          </>
        )}
      </section>

      <CalendarAgenda from={monthStart(year, month)} to={monthEnd(year, month)} selected={selected} />

      {data && (data.terms.length > 0 || data.years.length > 0) && (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card" aria-label="Academic year and terms">
          <h2 className="flex items-center gap-2 text-base font-bold text-navy"><CalendarDays size={16} className="text-brand-blue" /> Academic year and terms this month</h2>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {data.years.map((y) => (
              <li key={y.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-semibold text-navy">{y.name} {y.isCurrent && <Badge tone="success">Current</Badge>}</span>
                <span className="text-slate-500">{y.startDate} → {y.endDate}</span>
              </li>
            ))}
            {data.terms.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-slate-700">{t.name} <span className="text-xs text-slate-400">({t.academicYear.name})</span></span>
                <span className="text-slate-500">{t.startDate} → {t.endDate}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
