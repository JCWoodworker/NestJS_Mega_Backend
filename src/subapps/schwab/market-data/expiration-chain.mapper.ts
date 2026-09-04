/**
 * Maps Schwab `GET /marketdata/v1/expirationchain` into ascending YYYY-MM-DD
 * dates (nearest first), capped at `limit`.
 */
export function mapExpirationList(
  schwabResponse: any,
  opts: { todayEt: string; limit?: number } = { todayEt: '' },
): string[] {
  const limit = opts.limit ?? 10;
  const list: unknown[] = Array.isArray(schwabResponse?.expirationList)
    ? schwabResponse.expirationList
    : [];

  const dates = new Set<string>();
  for (const row of list) {
    const raw =
      typeof row === 'string'
        ? row
        : (row as any)?.expirationDate ?? (row as any)?.expiration;
    if (typeof raw !== 'string') continue;
    const date = raw.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    // Drop strictly past ET calendar days; keep today when present.
    if (opts.todayEt && date < opts.todayEt) continue;
    dates.add(date);
  }

  return [...dates].sort().slice(0, limit);
}

/** OSI YYMMDD → YYYY-MM-DD (UTC components match OCC date encoding). */
export function osiExpirationToDateKey(osi: string): string | null {
  if (osi.length < 12) return null;
  const yy = Number(osi.slice(6, 8));
  const mm = Number(osi.slice(8, 10));
  const dd = Number(osi.slice(10, 12));
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) {
    return null;
  }
  const year = 2000 + yy;
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}
