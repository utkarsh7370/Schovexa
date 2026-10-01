import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export type HolidayType = 'NATIONAL' | 'FESTIVAL' | 'VACATION' | 'SCHOOL' | 'OTHER';

// Dates are plain YYYY-MM-DD strings straight from the API (inclusive
// range; a one-day holiday has start === end).
export interface Holiday {
  id: string;
  name: string;
  type: HolidayType;
  startDate: string;
  endDate: string;
  description: string | null;
}

export interface NextHoliday {
  /** The school's current date (YYYY-MM-DD) — what every label is measured against. */
  today: string;
  holiday: Holiday | null;
  daysUntil: number | null;
  ongoing: boolean;
}

export const HOLIDAYS_QUERY_KEY = ['holidays'];
export const NEXT_HOLIDAY_QUERY_KEY = ['holidays', 'next'];

export function useHolidays() {
  return useQuery({ queryKey: HOLIDAYS_QUERY_KEY, queryFn: () => api.get<Holiday[]>('/holidays') });
}

export function useNextHoliday(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: NEXT_HOLIDAY_QUERY_KEY,
    queryFn: () => api.get<NextHoliday>('/holidays/next'),
    enabled: options?.enabled,
  });
}
