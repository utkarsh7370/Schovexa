'use client';

import Link from 'next/link';
import { ArrowRight, CalendarOff, PartyPopper } from 'lucide-react';
import { useNextHoliday } from '../hooks/useHolidays';
import { useCan } from '../hooks/useCan';
import { dayCount, formatRange, HOLIDAY_TYPE_META, weekday } from '../lib/holiday-ui';

// "Next holiday" for the dashboard — a glass card that sits on the dark
// hero. Links through to the full calendar. Renders nothing for roles
// that can't view holidays (so no request is made and no 403 appears).
export function NextHolidayCard() {
  const { can, isLoading } = useCan();
  const allowed = can('holiday.view');
  const { data } = useNextHoliday({ enabled: allowed });

  if (isLoading || !allowed || !data) return null;

  if (!data.holiday) {
    return (
      <Link
        href="/dashboard/holidays"
        className="group flex w-fit items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-inset ring-white/25 backdrop-blur transition-all hover:bg-white/20"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
          <CalendarOff size={20} />
        </span>
        <span>
          <span className="block text-sm font-bold">No upcoming holidays</span>
          <span className="block text-xs text-white/70">Open the holiday calendar</span>
        </span>
        <ArrowRight size={16} className="ml-1 transition-transform group-hover:translate-x-1" />
      </Link>
    );
  }

  const { holiday, daysUntil, ongoing } = data;
  const meta = HOLIDAY_TYPE_META[holiday.type];
  const Icon = meta.icon;
  const days = dayCount(holiday.startDate, holiday.endDate);
  const countdown = ongoing ? (days > 1 ? 'Happening now' : 'Today') : daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil} days`;

  return (
    <Link
      href="/dashboard/holidays"
      aria-label={`Next holiday: ${holiday.name}, ${countdown}. Open the holiday calendar`}
      className="group flex w-fit max-w-full items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-inset ring-white/25 backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/20"
    >
      <span className={['relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-card', meta.tile].join(' ')}>
        <Icon size={20} className="transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6" />
        {ongoing && (
          <span className="absolute -right-1 -top-1 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full bg-emerald-300" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-navy" />
          </span>
        )}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-white/70">
          <PartyPopper size={12} /> Next holiday · <span className="text-amber-300">{countdown}</span>
        </span>
        <span className="block truncate text-sm font-bold">{holiday.name}</span>
        <span className="block text-xs text-white/70">
          {weekday(holiday.startDate)}, {formatRange(holiday.startDate, holiday.endDate)}
          {days > 1 ? ` · ${days} days` : ''}
        </span>
      </span>
      <ArrowRight size={16} className="ml-1 shrink-0 transition-transform group-hover:translate-x-1" />
    </Link>
  );
}
