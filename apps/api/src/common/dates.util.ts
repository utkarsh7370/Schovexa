// Calendar-date helpers that respect a school's own time zone.
//
// "Today" is not one instant for everyone: 23:30 on 1 October in
// Kolkata is already 2 October in Auckland and still 1 October in
// London. Anything that asks "is this date in the past?" for a school
// (attendance locking, holiday "next up") has to ask in *that school's*
// zone, never the server's or the browser's.

const FALLBACK_TIMEZONE = 'Asia/Kolkata';

/** The school's current calendar date as YYYY-MM-DD. */
export function todayInTimezone(timeZone: string | null | undefined, now: Date = new Date()): string {
  try {
    // The en-CA locale formats dates as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || FALLBACK_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    // A time zone string Intl doesn't know — fall back rather than 500.
    return new Intl.DateTimeFormat('en-CA', { timeZone: FALLBACK_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  }
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD from a Date stored in a Postgres DATE column (UTC midnight). */
export function dateOnlyToIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Minutes since local midnight in the given zone (e.g. 09:30 → 570). */
export function minutesOfDayInTimezone(timeZone: string | null | undefined, now: Date = new Date()): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-GB', { timeZone: timeZone || FALLBACK_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat('en-GB', { timeZone: FALLBACK_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  }
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

/** "09:30" → 570. Expects the validated HH:mm shape. */
export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

/** Minutes the zone is ahead of UTC at a given instant (Kolkata → 330). */
function zoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/**
 * The real start and end instants of one calendar day *in the school's time zone*.
 * "Today's collection" means the school's today — 11:30 pm in Kolkata is still today
 * there even though it is already tomorrow in UTC.
 */
export function localDayRange(timeZone: string | null | undefined, iso: string): { start: Date; end: Date } {
  const zone = timeZone || FALLBACK_TIMEZONE;
  const [y, m, d] = iso.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d));
  let offset: number;
  try {
    offset = zoneOffsetMinutes(zone, guess);
  } catch {
    offset = zoneOffsetMinutes(FALLBACK_TIMEZONE, guess);
  }
  const start = new Date(guess.getTime() - offset * 60_000);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60_000 - 1) };
}
