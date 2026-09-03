import { LEVEL_ONE_OPTIONS_FIELDS } from './level-one-fields';

/**
 * Normalized shape emitted to the frontend over `option-ticks` (replaces the
 * old raw-field-number passthrough - see the "option-ticks field
 * mislabeling" changelog entry in schwab-frontend-notes.md for why: the
 * previous contract asked the frontend to decode Schwab's numeric field
 * keys itself using a mapping this backend had documented incorrectly,
 * which meant every "Change"-type delta update the frontend received
 * had `bid`/`ask`/`last` sitting at *empty* keys and always rendered `--`).
 *
 * Schwab's LEVELONE_OPTIONS delivery type is "Change": only fields that
 * changed since the last tick for that symbol are present. That partial-
 * update semantics is preserved here deliberately - fields are `undefined`
 * (omitted) rather than defaulted to `0`/`null`, so the frontend can merge
 * ticks into its per-symbol state without a changed field ever looking like
 * a real update to `0`.
 */
export interface OptionTick {
  symbol: string;
  bid?: number;
  ask?: number;
  last?: number;
  bidSize?: number;
  askSize?: number;
  volume?: number;
  openInterest?: number;
  delta?: number;
}

/**
 * Maps one raw Schwab LEVELONE_OPTIONS content entry into `OptionTick`.
 * Schwab includes the option's OSI symbol as `key` on every entry (not just
 * field `0`, which is frequently omitted on delta updates) - `key` is the
 * same format used in `ladder-recentered`'s `symbols` array, so the
 * frontend can correlate ticks to ladder rows without decoding field `0`.
 */
export function mapOptionTick(raw: Record<string, unknown>): OptionTick | null {
  const symbol =
    (raw.key as string) ?? (raw[LEVEL_ONE_OPTIONS_FIELDS.SYMBOL] as string);
  if (!symbol) return null;

  const tick: OptionTick = { symbol };

  const bid = raw[LEVEL_ONE_OPTIONS_FIELDS.BID_PRICE];
  if (typeof bid === 'number') tick.bid = bid;

  const ask = raw[LEVEL_ONE_OPTIONS_FIELDS.ASK_PRICE];
  if (typeof ask === 'number') tick.ask = ask;

  const last = raw[LEVEL_ONE_OPTIONS_FIELDS.LAST_PRICE];
  if (typeof last === 'number') tick.last = last;

  const bidSize = raw[LEVEL_ONE_OPTIONS_FIELDS.BID_SIZE];
  if (typeof bidSize === 'number') tick.bidSize = bidSize;

  const askSize = raw[LEVEL_ONE_OPTIONS_FIELDS.ASK_SIZE];
  if (typeof askSize === 'number') tick.askSize = askSize;

  const volume = raw[LEVEL_ONE_OPTIONS_FIELDS.TOTAL_VOLUME];
  if (typeof volume === 'number') tick.volume = volume;

  const openInterest = raw[LEVEL_ONE_OPTIONS_FIELDS.OPEN_INTEREST];
  if (typeof openInterest === 'number') tick.openInterest = openInterest;

  const delta = raw[LEVEL_ONE_OPTIONS_FIELDS.DELTA];
  if (typeof delta === 'number') tick.delta = delta;

  return tick;
}

export function mapOptionTicks(
  rawTicks: Array<Record<string, unknown>>,
): OptionTick[] {
  const mapped: OptionTick[] = [];
  for (const raw of rawTicks) {
    const tick = mapOptionTick(raw);
    if (tick) mapped.push(tick);
  }
  return mapped;
}
