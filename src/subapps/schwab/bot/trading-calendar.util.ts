/**
 * Is the US equity market open on a given ET calendar day.
 *
 * Deliberately a static list rather than a market-data lookup. The supervisor
 * only needs this to avoid arming on a day that will produce no ticks, and a
 * wrong answer is cheap in both directions: arming on a closed day does
 * nothing (no quotes, so no signals), while refusing on an open day costs one
 * session. That asymmetry does not justify a network dependency in the
 * unattended path, where a slow or down calendar API would block arming on a
 * perfectly good trading day.
 *
 * The list must be extended each year. `isBeyondCalendarCoverage` exists so
 * the supervisor can warn before it goes stale, rather than quietly treating
 * every holiday as a trading day.
 */

/**
 * NYSE/Nasdaq full closures, ET calendar dates.
 *
 * Half days (the 1pm closes around Thanksgiving and Christmas) are
 * deliberately absent: the market *is* open, and the bot's own
 * `hardFlattenTime` already governs when it stops trading. Treating them as
 * closed would skip tradeable sessions.
 */
const MARKET_HOLIDAYS = new Set<string>([
  // 2026
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Jr. Day
  '2026-02-16', // Washington's Birthday
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (observed)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas
  // 2027
  '2027-01-01',
  '2027-01-18',
  '2027-02-15',
  '2027-03-26', // Good Friday
  '2027-05-31',
  '2027-06-18', // Juneteenth (observed)
  '2027-07-05', // Independence Day (observed)
  '2027-09-06',
  '2027-11-25',
  '2027-12-24', // Christmas (observed)
]);

/** Last year covered by `MARKET_HOLIDAYS`. */
const LAST_COVERED_YEAR = 2027;

/** ET weekday, 0 = Sunday. Noon UTC keeps the date stable either side of DST. */
function etWeekday(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

export function isWeekend(dateKey: string): boolean {
  const day = etWeekday(dateKey);
  return day === 0 || day === 6;
}

export function isMarketHoliday(dateKey: string): boolean {
  return MARKET_HOLIDAYS.has(dateKey);
}

/** A regular session day — a weekday that is not a full closure. */
export function isTradingDay(dateKey: string): boolean {
  return !isWeekend(dateKey) && !isMarketHoliday(dateKey);
}

/**
 * True once `dateKey` is past the holiday list's coverage, so callers can
 * warn instead of silently treating holidays as trading days.
 */
export function isBeyondCalendarCoverage(dateKey: string): boolean {
  const year = Number(dateKey.slice(0, 4));
  return Number.isFinite(year) && year > LAST_COVERED_YEAR;
}
