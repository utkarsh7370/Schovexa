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
