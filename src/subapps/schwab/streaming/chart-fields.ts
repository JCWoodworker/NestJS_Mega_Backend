/**
 * Schwab Streamer `CHART_EQUITY`/`CHART_OPTIONS` field maps (Streamer
 * Guide). Backs live `chart-candle` streaming (frontend contract section
 * 9c) - both services only ever push 1-minute candles; higher timeframes
 * are aggregated client-side.
 */
export const CHART_EQUITY_FIELDS = {
  KEY: '0',
  OPEN: '1',
  HIGH: '2',
  LOW: '3',
  CLOSE: '4',
  VOLUME: '5',
  SEQUENCE: '6',
  CHART_TIME: '7',
  CHART_DAY: '8',
} as const;

export const CHART_EQUITY_FIELD_KEYS =
  Object.values(CHART_EQUITY_FIELDS).join(',');

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
