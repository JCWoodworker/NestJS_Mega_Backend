import { etDateKey, etDayBounds } from './et-date.util';

describe('etDateKey', () => {
  it('formats an America/New_York calendar date as YYYY-MM-DD', () => {
    // 2026-09-03 22:00 UTC = 18:00 EDT → still Sep 3
    expect(etDateKey(new Date('2026-09-03T22:00:00Z'))).toBe('2026-09-03');
    // 2026-09-04 03:00 UTC = 23:00 EDT Sep 3 → still Sep 3
    expect(etDateKey(new Date('2026-09-04T03:00:00Z'))).toBe('2026-09-03');
    // 2026-09-04 04:00 UTC = 00:00 EDT Sep 4 → Sep 4
    expect(etDateKey(new Date('2026-09-04T04:00:00Z'))).toBe('2026-09-04');
  });
});

describe('etDayBounds', () => {
  it('returns a 24h window covering the ET calendar day', () => {
    const { start, end } = etDayBounds('2026-09-03');
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    // Spot-check: noon ET on that day should fall inside the bounds.
    const noonEt = new Date('2026-09-03T16:00:00Z'); // 12:00 EDT
    expect(noonEt.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(noonEt.getTime()).toBeLessThan(end.getTime());
  });
});
