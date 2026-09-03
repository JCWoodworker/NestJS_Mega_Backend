import { CHART_EQUITY_FIELDS, CHART_OPTIONS_FIELDS } from './chart-fields';
import { ChartCandlePayload } from './options.gateway';

/**
 * Guards against emitting a structurally impossible bar (`low > high`, or
 * open/close outside the [low, high] range) - the exact symptom of the
 * `CHART_EQUITY` field-shift bug (see `chart-fields.ts`). Kept as a runtime
 * safety net even after fixing the field map, so a future regression shows
 * up as a dropped-candle warning in the logs rather than a silently bad
 * chart bar. Frontend also guards client-side (`isSaneCandle` in
 * `src/lib/candles.ts`) - both are deliberately redundant.
 */
function isSaneCandle(candle: {
  open: number;
  high: number;
  low: number;
  close: number;
}): boolean {
  const { open, high, low, close } = candle;
  if (
    [open, high, low, close].some(
      (v) => typeof v !== 'number' || !Number.isFinite(v),
    )
  ) {
    return false;
  }
  return (
    low <= high && low <= open && low <= close && high >= open && high >= close
  );
}

/** Maps one raw Schwab `CHART_EQUITY` content entry into `ChartCandlePayload`. */
export function mapChartEquityCandle(
  raw: Record<string, unknown>,
  fallbackSymbol: string,
): ChartCandlePayload | null {
  const chartTime = raw[CHART_EQUITY_FIELDS.CHART_TIME];
  if (typeof chartTime !== 'number') return null;

  const candle: ChartCandlePayload = {
    symbol: (raw[CHART_EQUITY_FIELDS.KEY] as string) ?? fallbackSymbol,
    assetType: 'EQUITY',
    open: raw[CHART_EQUITY_FIELDS.OPEN] as number,
    high: raw[CHART_EQUITY_FIELDS.HIGH] as number,
    low: raw[CHART_EQUITY_FIELDS.LOW] as number,
    close: raw[CHART_EQUITY_FIELDS.CLOSE] as number,
    volume: raw[CHART_EQUITY_FIELDS.VOLUME] as number,
    chartTime,
  };

  return isSaneCandle(candle) ? candle : null;
}

/** Maps one raw Schwab `CHART_OPTIONS` content entry into `ChartCandlePayload`. */
export function mapChartOptionCandle(
  raw: Record<string, unknown>,
  fallbackSymbol: string,
): ChartCandlePayload | null {
  const chartTime = raw[CHART_OPTIONS_FIELDS.CHART_TIME];
  if (typeof chartTime !== 'number') return null;

  const candle: ChartCandlePayload = {
    symbol: (raw[CHART_OPTIONS_FIELDS.KEY] as string) ?? fallbackSymbol,
    assetType: 'OPTION',
    open: raw[CHART_OPTIONS_FIELDS.OPEN] as number,
    high: raw[CHART_OPTIONS_FIELDS.HIGH] as number,
    low: raw[CHART_OPTIONS_FIELDS.LOW] as number,
    close: raw[CHART_OPTIONS_FIELDS.CLOSE] as number,
    volume: raw[CHART_OPTIONS_FIELDS.VOLUME] as number,
    chartTime,
  };

  return isSaneCandle(candle) ? candle : null;
}
