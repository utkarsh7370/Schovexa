// Academic years expire on their own once their end date passes, so a test
// can't hard-code "2025-26" and expect to be able to add classes to it
// next year. These helpers build ranges relative to today instead.

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (date: Date) => date.toISOString().slice(0, 10);

/** A year that started 90 days ago and ends 275 days from now — "the current year" whenever the test runs. */
export function currentYearDates(now = new Date()) {
  return { startDate: iso(new Date(now.getTime() - 90 * DAY_MS)), endDate: iso(new Date(now.getTime() + 275 * DAY_MS)) };
}

/** The year right after `currentYearDates()`, with no overlap. */
export function nextYearDates(now = new Date()) {
  return { startDate: iso(new Date(now.getTime() + 276 * DAY_MS)), endDate: iso(new Date(now.getTime() + 640 * DAY_MS)) };
}

/** A year that has already ended. */
export function pastYearDates(now = new Date()) {
  return { startDate: iso(new Date(now.getTime() - 500 * DAY_MS)), endDate: iso(new Date(now.getTime() - 135 * DAY_MS)) };
}
