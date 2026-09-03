/**
 * America/New_York calendar date as YYYY-MM-DD.
 * Used for daily P&L rollups (market calendar), intentionally distinct from
 * the UTC date key used for 0DTE ladder rollover in the streamer.
 */
export function etDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Start (inclusive) and end (exclusive) of an ET calendar day as UTC Dates. */
export function etDayBounds(dateKey: string): { start: Date; end: Date } {
  const noonProbe = new Date(`${dateKey}T12:00:00Z`);
  const offsetParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'shortOffset',
    hour: 'numeric',
  }).formatToParts(noonProbe);
  const tzName =
    offsetParts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-4';
  const match = tzName.match(/GMT([+-]\d+)/);
  const offsetHours = match ? Number(match[1]) : -4;
  const sign = offsetHours <= 0 ? '-' : '+';
  const offsetStr = `${sign}${String(Math.abs(offsetHours)).padStart(
    2,
    '0',
  )}:00`;

  const start = new Date(`${dateKey}T00:00:00${offsetStr}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
