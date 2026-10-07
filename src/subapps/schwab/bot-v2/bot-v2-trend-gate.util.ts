import { BotCandle, SignalDirection } from '@schwab/bot/bot-strategy.util';

/** Minutes of closes the session trend is read from. */
export const TREND_SMA_MINUTES = 20;
/** Fewer minutes than this and the gate stays open — too early to call a trend. */
export const TREND_MIN_MINUTES = 10;

export type TrendBias = 'UP' | 'DOWN' | null;

/**
 * Side of the 20-minute average the last close sits on. Candles may be any
 * bar size; the window is scaled so it always covers the same minutes.
 * Replayed on Mon–Wed 2026-10-05..07 trainer tape: with-trend entries won
 * 50–61% by day, against-trend 29–31%.
 */
export function trendBias(
  candles: BotCandle[],
  barSeconds: number,
  smaMinutes = TREND_SMA_MINUTES,
  minMinutes = TREND_MIN_MINUTES,
): TrendBias {
  const perMinute = Math.max(1, Math.round(60 / Math.max(1, barSeconds)));
  const need = minMinutes * perMinute;
  if (candles.length < need) return null;
  const window = candles.slice(-smaMinutes * perMinute);
  const sma = window.reduce((sum, c) => sum + c.close, 0) / window.length;
  const last = candles[candles.length - 1].close;
  if (last === sma) return null;
  return last > sma ? 'UP' : 'DOWN';
}

/** A trade may only lean the way the session is already leaning. */
export function directionMatchesTrend(
  direction: SignalDirection | `${SignalDirection}`,
  bias: TrendBias,
): boolean {
  if (bias == null) return true;
  return direction === 'CALL' ? bias === 'UP' : bias === 'DOWN';
}
