/** Inclusive calendar days from `from` through `to`, both `YYYY-MM-DD`. */
export function eachDateKey(from: string, to: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new Error('Date keys must be YYYY-MM-DD');
  }
  if (from > to) throw new Error(`Fixture range ${from} is after ${to}`);

  const keys: string[] = [];
  let cursor = Date.parse(`${from}T12:00:00Z`);
  const end = Date.parse(`${to}T12:00:00Z`);
  while (cursor <= end) {
    keys.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 24 * 60 * 60 * 1000;
  }
  return keys;
}
