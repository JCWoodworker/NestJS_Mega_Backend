export type TrainerExpirationMode = '0DTE' | '1DTE';

export function isTrainerExpirationMode(
  value: string,
): value is TrainerExpirationMode {
  return value === '0DTE' || value === '1DTE';
}

/**
 * 0DTE is today (ET). 1DTE is the next listed expiration after today, still
 * flattened the same session — less theta, not an overnight hold.
 * Returns null when 1DTE is on and the calendar has no later date.
 */
export function resolveTrainerExpiration(
  mode: TrainerExpirationMode | null | undefined,
  todayEt: string,
  listed: readonly string[],
): string | null {
  if (mode !== '1DTE') return todayEt;
  const next = listed.filter((day) => day > todayEt).sort()[0];
  return next ?? null;
}
