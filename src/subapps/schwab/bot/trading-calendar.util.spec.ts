import {
  isBeyondCalendarCoverage,
  isMarketHoliday,
  isTradingDay,
  isWeekend,
} from './trading-calendar.util';

describe('trading calendar', () => {
  it('identifies weekends from the ET calendar date', () => {
    // 2026-09-19 is a Saturday, 2026-09-20 a Sunday.
    expect(isWeekend('2026-09-19')).toBe(true);
    expect(isWeekend('2026-09-20')).toBe(true);
    expect(isWeekend('2026-09-18')).toBe(false);
  });

  it('identifies full market closures', () => {
    expect(isMarketHoliday('2026-12-25')).toBe(true);
    expect(isMarketHoliday('2026-11-26')).toBe(true);
    expect(isMarketHoliday('2026-09-18')).toBe(false);
  });

  /**
   * Half days are open days. Treating the 1pm closes as holidays would skip
   * tradeable sessions; the bot's own hardFlattenTime governs when it stops.
   */
  it('treats half days as trading days', () => {
    expect(isTradingDay('2026-11-27')).toBe(true); // day after Thanksgiving
    expect(isTradingDay('2026-12-24')).toBe(true); // Christmas Eve
  });

  it('combines weekend and holiday checks', () => {
    expect(isTradingDay('2026-09-18')).toBe(true);
    expect(isTradingDay('2026-09-19')).toBe(false);
    expect(isTradingDay('2026-12-25')).toBe(false);
  });

  /**
   * The list is static and must be extended each year. Without this the
   * supervisor would silently treat every future holiday as a trading day.
   */
  it('flags dates past the curated coverage', () => {
    expect(isBeyondCalendarCoverage('2027-06-01')).toBe(false);
    expect(isBeyondCalendarCoverage('2028-01-03')).toBe(true);
  });

  it('is stable either side of DST', () => {
    // A date whose UTC midnight falls on the previous ET day would shift a
    // weekday if computed naively.
    expect(isWeekend('2026-03-08')).toBe(true); // Sunday, DST starts
    expect(isWeekend('2026-11-01')).toBe(true); // Sunday, DST ends
  });
});
