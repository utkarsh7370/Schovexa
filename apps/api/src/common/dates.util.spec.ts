import { dateOnlyToIso, todayInTimezone } from './dates.util';

describe('todayInTimezone', () => {
  // 2026-10-01 20:00 UTC — still the 1st in London/UTC, already the 2nd in Kolkata (01:30 IST) and Auckland.
  const instant = new Date('2026-10-01T20:00:00Z');

  it('returns the calendar date in the given zone, not the server zone', () => {
    expect(todayInTimezone('UTC', instant)).toBe('2026-10-01');
    expect(todayInTimezone('Europe/London', instant)).toBe('2026-10-01'); // BST, 21:00
    expect(todayInTimezone('Asia/Kolkata', instant)).toBe('2026-10-02');
    expect(todayInTimezone('Pacific/Auckland', instant)).toBe('2026-10-02');
    expect(todayInTimezone('America/Los_Angeles', instant)).toBe('2026-10-01');
  });

  it('zero-pads month and day', () => {
    expect(todayInTimezone('UTC', new Date('2026-03-05T10:00:00Z'))).toBe('2026-03-05');
  });

  it('falls back instead of throwing on an unknown or empty zone', () => {
    expect(todayInTimezone('Not/AZone', instant)).toBe('2026-10-02'); // Asia/Kolkata fallback
    expect(todayInTimezone(null, instant)).toBe('2026-10-02');
    expect(todayInTimezone('', instant)).toBe('2026-10-02');
  });
});

describe('dateOnlyToIso', () => {
  it('formats a UTC-midnight DATE value', () => {
    expect(dateOnlyToIso(new Date('2026-04-01T00:00:00.000Z'))).toBe('2026-04-01');
  });
});
