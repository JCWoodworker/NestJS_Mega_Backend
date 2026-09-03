/**
 * Schwab Streamer `CHART_EQUITY`/`CHART_OPTIONS` field maps (Streamer
 * Guide). Backs live `chart-candle` streaming (frontend contract section
 * 9c) - both services only ever push 1-minute candles; higher timeframes
 * are aggregated client-side.
 *
 * `CHART_EQUITY_FIELDS` below was previously `OPEN:'1', HIGH:'2', LOW:'3',
 * CLOSE:'4', VOLUME:'5', SEQUENCE:'6'` - a copy of a third-party mirror of
 * Schwab's docs that turned out to be off by one against real data. A raw
 * frame captured live on preprod 2026-09-03
 * (`{"1":311,"2":772.625,"3":772.67,"4":772.41,"5":772.438321,"6":71229,
 * "7":1788451860000,"8":20699}`) makes the true mapping unambiguous: field
 * `1` (311) is far too small to be a SPY price and matches a monotonic
 * per-session minute counter (Sequence), while treating `2..5` as
 * open/high/low/close and `6` as volume produces a fully self-consistent
 * bar (low <= open/close <= high, volume a plausible 1-minute share count).
 * Same bug family as the `LEVELONE_OPTIONS` field mislabel fixed the same
 * day (`level-one-fields.ts`) - fields shifted by one relative to what the
 * (wrong) doc claimed.
 */
export const CHART_EQUITY_FIELDS = {
  KEY: '0',
  SEQUENCE: '1',
  OPEN: '2',
  HIGH: '3',
  LOW: '4',
  CLOSE: '5',
  VOLUME: '6',
  CHART_TIME: '7',
  CHART_DAY: '8',
} as const;

export const CHART_EQUITY_FIELD_KEYS =
  Object.values(CHART_EQUITY_FIELDS).join(',');

/**
 * Unlike `CHART_EQUITY_FIELDS` above, this map was never observed producing
 * impossible bars and already places `OPEN` at field `2` (not `1`), so it
 * does not appear to carry the same off-by-one - but it also hasn't been
 * independently confirmed against a live raw `CHART_OPTIONS` frame (no
 * option-chart subscriber was active during the 2026-09-03 investigation
 * that caught the `CHART_EQUITY` bug). Treat as believed-correct, not
 * live-verified.
 */
export const CHART_OPTIONS_FIELDS = {
  KEY: '0',
  CHART_TIME: '1',
  OPEN: '2',
  HIGH: '3',
  LOW: '4',
  CLOSE: '5',
  VOLUME: '6',
} as const;

export const CHART_OPTIONS_FIELD_KEYS =
  Object.values(CHART_OPTIONS_FIELDS).join(',');
