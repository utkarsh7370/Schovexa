import { Sun, Sunrise, Sunset, type LucideIcon } from 'lucide-react';

export type SchoolDay = 'FULL_DAY' | 'FIRST_HALF' | 'SECOND_HALF';

export const SCHOOL_DAY_OPTIONS: { value: SchoolDay; label: string; short: string; description: string; icon: LucideIcon }[] = [
  { value: 'FULL_DAY', label: 'Full day', short: 'Full day', description: 'Attends the whole school day.', icon: Sun },
  { value: 'FIRST_HALF', label: 'First half only', short: 'First half', description: 'Attends the morning session only.', icon: Sunrise },
  { value: 'SECOND_HALF', label: 'Second half only', short: 'Second half', description: 'Attends the afternoon session only.', icon: Sunset },
];

// Half-day students are meant to stand out wherever they appear: warm amber
// for the morning session, indigo for the afternoon — never the same colour
// as a status badge, so the two can sit side by side.
export const SCHOOL_DAY_STYLE: Record<Exclude<SchoolDay, 'FULL_DAY'>, { pill: string; tile: string; bar: string }> = {
  FIRST_HALF: {
    pill: 'bg-amber-100 text-amber-800 ring-amber-300',
    tile: 'bg-gradient-to-br from-amber-300 to-orange-400 text-white',
    bar: 'from-amber-300 to-orange-400',
  },
  SECOND_HALF: {
    pill: 'bg-indigo-100 text-indigo-800 ring-indigo-300',
    tile: 'bg-gradient-to-br from-indigo-400 to-violet-500 text-white',
    bar: 'from-indigo-400 to-violet-500',
  },
};

export const schoolDayMeta = (value: SchoolDay | null | undefined) => SCHOOL_DAY_OPTIONS.find((o) => o.value === value) ?? SCHOOL_DAY_OPTIONS[0];
export const isHalfDay = (value: SchoolDay | null | undefined): value is Exclude<SchoolDay, 'FULL_DAY'> => value === 'FIRST_HALF' || value === 'SECOND_HALF';
