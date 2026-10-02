import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export type DayOffReason = 'WEEKLY_OFF' | 'OFF_SATURDAY' | 'HOLIDAY';

export interface CalendarDay {
  date: string;
  weekday: number;
  working: boolean;
  reason: DayOffReason | null;
  holidays: { id: string; name: string; type: string }[];
}

export interface SchoolCalendar {
  today: string;
  from: string;
  to: string;
  rules: { workingDays: number[]; offSaturdays: number[] };
  timings: { schoolStartTime: string; schoolEndTime: string; breakStartTime: string | null; breakEndTime: string | null };
  summary: { workingDays: number; holidays: number; weeklyOff: number };
  days: CalendarDay[];
  terms: { id: string; name: string; startDate: string; endDate: string; academicYear: { id: string; name: string } }[];
  years: { id: string; name: string; startDate: string; endDate: string; isCurrent: boolean }[];
}

export function useCalendar(from: string | undefined, to: string | undefined) {
  const qs = from && to ? `?from=${from}&to=${to}` : '';
  return useQuery({
    queryKey: ['calendar', from, to],
    queryFn: () => api.get<SchoolCalendar>(`/calendar${qs}`),
    placeholderData: keepPreviousData,
  });
}
