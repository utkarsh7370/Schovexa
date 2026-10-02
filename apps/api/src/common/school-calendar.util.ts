// The school week, as pure functions: is a given date a working day, and
// if not, why? Used by attendance (no marking on a day off) and the
// school calendar, so both always agree.

export interface WeekRules {
  /** ISO weekdays that are teaching days: 1 = Monday … 7 = Sunday. */
  workingDays: number[];
  /** Which Saturdays of the month are off (1st, 2nd, …) — only matters when Saturday is a working day. */
  offSaturdays: number[];
}

export type DayOffReason = 'WEEKLY_OFF' | 'OFF_SATURDAY' | 'HOLIDAY';

export interface DayHoliday {
  id: string;
  name: string;
  type: string;
}

export interface DayStatus {
  date: string;
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  weekday: number;
  working: boolean;
  reason: DayOffReason | null;
  holidays: DayHoliday[];
}

/** 1 = Monday … 7 = Sunday, for a YYYY-MM-DD date (calendar arithmetic only — no time zone involved). */
export function isoWeekday(iso: string): number {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return day === 0 ? 7 : day;
}

/** Which occurrence of its weekday a date is within its month: days 1–7 → 1, 8–14 → 2, … */
export function weekOfMonth(iso: string): number {
  return Math.ceil(Number(iso.slice(8, 10)) / 7);
}

export function classifyDay(iso: string, rules: WeekRules, holidays: DayHoliday[] = []): DayStatus {
  const weekday = isoWeekday(iso);
  let reason: DayOffReason | null = null;
  if (!rules.workingDays.includes(weekday)) reason = 'WEEKLY_OFF';
  else if (weekday === 6 && rules.offSaturdays.includes(weekOfMonth(iso))) reason = 'OFF_SATURDAY';
  else if (holidays.length > 0) reason = 'HOLIDAY';
  return { date: iso, weekday, working: reason === null, reason, holidays };
}

export function describeDayOff(status: DayStatus): string {
  const names = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  if (status.reason === 'WEEKLY_OFF') return `${names[status.weekday]} is not a working day for this school.`;
  if (status.reason === 'OFF_SATURDAY') return 'This Saturday is a day off in the school’s calendar.';
  if (status.reason === 'HOLIDAY') return `${status.holidays[0]?.name ?? 'A holiday'} is a school holiday.`;
  return '';
}

/** Every YYYY-MM-DD from `from` to `to`, inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const end = new Date(`${to}T00:00:00Z`).getTime();
  for (let t = new Date(`${from}T00:00:00Z`).getTime(); t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}
