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

/**
 * Parse a user/API date into a timestamptz that lands on the intended
 * America/New_York calendar day.
 *
 * Date-only (`YYYY-MM-DD`) and UTC-midnight ISO strings are treated as a
 * calendar day label (noon ET that day), not as UTC midnight — otherwise a
 * MANUAL "today" transfer of `2026-09-03` / `2026-09-03T00:00:00.000Z` falls
 * on the previous ET evening and is missed by that day's daily rollup.
 */
export function parseEtCalendarDate(input: string): Date {
  const trimmed = input.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? trimmed
    : /^\d{4}-\d{2}-\d{2}T00:00:00(\.0+)?(Z|[+-]00:00)?$/.test(trimmed)
      ? trimmed.slice(0, 10)
      : null;

  if (dateOnly) {
    const { start } = etDayBounds(dateOnly);
    return new Date(start.getTime() + 12 * 60 * 60 * 1000);
  }

  return new Date(trimmed);
}

/**
 * Which ET calendar day a stored transfer should count toward.
 * MANUAL rows stored as UTC midnight (legacy date-only writes) use the UTC
 * Y-M-D as the intended calendar day so existing starting-balance rows still
 * roll into the day the user picked.
 */
export function transferEtDateKey(
  transactionDate: Date,
  source?: string | null,
): string {
  const d = new Date(transactionDate);
  if (
    source === 'MANUAL' &&
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    return d.toISOString().slice(0, 10);
  }
  return etDateKey(d);
}
