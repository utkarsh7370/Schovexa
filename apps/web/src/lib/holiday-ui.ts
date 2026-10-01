import { Flag, GraduationCap, CalendarHeart, PartyPopper, Palmtree, type LucideIcon } from 'lucide-react';
import type { HolidayType } from '../hooks/useHolidays';

export interface HolidayTypeMeta {
  label: string;
  icon: LucideIcon;
  /** Gradient for the date tile / icon chip. */
  tile: string;
  /** Soft chip colors. */
  chip: string;
}

export const HOLIDAY_TYPE_META: Record<HolidayType, HolidayTypeMeta> = {
  NATIONAL: { label: 'National holiday', icon: Flag, tile: 'from-orange-400 to-rose-500', chip: 'bg-orange-50 text-orange-700 ring-orange-200' },
  FESTIVAL: { label: 'Festival', icon: PartyPopper, tile: 'from-fuchsia-400 to-violet-600', chip: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200' },
  VACATION: { label: 'Vacation', icon: Palmtree, tile: 'from-emerald-400 to-teal-600', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  SCHOOL: { label: 'School closed', icon: GraduationCap, tile: 'from-sky-400 to-blue-600', chip: 'bg-sky-50 text-sky-700 ring-sky-200' },
  OTHER: { label: 'Other', icon: CalendarHeart, tile: 'from-amber-400 to-orange-500', chip: 'bg-amber-50 text-amber-700 ring-amber-200' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Everything here works on the YYYY-MM-DD strings directly. Going through
// `new Date('2030-11-10')` would parse as UTC midnight and, in a zone
// west of UTC, display as the previous day.
function parts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

export const monthKey = (iso: string) => iso.slice(0, 7);
export function monthTitle(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

export function dayCount(start: string, end: string): number {
  return Math.round((Date.UTC(...ymd(end)) - Date.UTC(...ymd(start))) / 86_400_000) + 1;
}
function ymd(iso: string): [number, number, number] {
  const { y, m, d } = parts(iso);
  return [y, m - 1, d];
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.UTC(...ymd(toIso)) - Date.UTC(...ymd(fromIso))) / 86_400_000);
}

export function formatRange(start: string, end: string): string {
  const a = parts(start);
  const b = parts(end);
  if (start === end) return `${a.d} ${MONTHS[a.m - 1]} ${a.y}`;
  if (a.y === b.y && a.m === b.m) return `${a.d} – ${b.d} ${MONTHS[a.m - 1]} ${a.y}`;
  if (a.y === b.y) return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]} ${a.y}`;
  return `${a.d} ${MONTHS[a.m - 1]} ${a.y} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
}

export function weekday(iso: string): string {
  const { y, m, d } = parts(iso);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

export function dateTile(start: string, end: string): { top: string; bottom: string } {
  const a = parts(start);
  const b = parts(end);
  const sameMonth = a.y === b.y && a.m === b.m;
  return {
    top: start === end ? String(a.d) : sameMonth ? `${a.d}–${b.d}` : String(a.d),
    bottom: MONTHS[a.m - 1],
  };
}

export type HolidayStatus = 'ongoing' | 'today' | 'soon' | 'upcoming' | 'past';

export function statusOf(h: { startDate: string; endDate: string }, today: string): { status: HolidayStatus; label: string } {
  if (h.endDate < today) return { status: 'past', label: 'Past' };
  if (h.startDate <= today) return h.startDate === h.endDate ? { status: 'today', label: 'Today' } : { status: 'ongoing', label: 'Happening now' };
  const days = daysBetween(today, h.startDate);
  if (days === 1) return { status: 'soon', label: 'Tomorrow' };
  return { status: days <= 7 ? 'soon' : 'upcoming', label: `In ${days} days` };
}
