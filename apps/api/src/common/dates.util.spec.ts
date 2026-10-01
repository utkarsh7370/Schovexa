import { dateOnlyToIso, hmToMinutes, minutesOfDayInTimezone, todayInTimezone } from './dates.util';

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

describe('minutesOfDayInTimezone', () => {
  const instant = new Date('2026-10-01T20:00:00Z');

  it('reads the clock in the given zone', () => {
    expect(minutesOfDayInTimezone('UTC', instant)).toBe(20 * 60);
    expect(minutesOfDayInTimezone('Asia/Kolkata', instant)).toBe(1 * 60 + 30); // 01:30 the next day
    expect(minutesOfDayInTimezone('America/New_York', instant)).toBe(16 * 60); // EDT, 16:00
  });

  it('treats midnight as 0, not 24', () => {
    expect(minutesOfDayInTimezone('UTC', new Date('2026-10-01T00:05:00Z'))).toBe(5);
  });

  it('falls back instead of throwing for an unknown zone', () => {
    expect(minutesOfDayInTimezone('Mars/Olympus', instant)).toBe(1 * 60 + 30);
  });
});

describe('hmToMinutes', () => {
  it('converts HH:mm', () => {
    expect(hmToMinutes('09:30')).toBe(570);
    expect(hmToMinutes('00:00')).toBe(0);
    expect(hmToMinutes('23:59')).toBe(1439);
  });
});
