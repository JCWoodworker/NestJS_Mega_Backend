import {
  BotCandle,
  SESSION_VWAP_MIN_MINUTES,
  SignalDirection,
  sessionVwapFromCandles,
} from '@schwab/bot/bot-strategy.util';

/** Fewer session minutes than this and the gate stays open. */
export const TREND_MIN_MINUTES = SESSION_VWAP_MIN_MINUTES;

export type TrendBias = 'UP' | 'DOWN' | null;

/**
 * Session VWAP from 9:30 ET on. Index 1-minute bars often have no volume,
 * so those fall back to the mean of typical prices (H+L+C)/3.
 */
export function sessionVwap(
  candles: BotCandle[],
  sessionStartMs: number,
): number | null {
  return sessionVwapFromCandles(candles, sessionStartMs);
}

/**
 * Side of session VWAP the last price sits on. Use 1-minute session bars,
 * not the 15-second signal bars — those flip too often to be a trend.
 */
export function trendBias(
  minutes: BotCandle[],
  sessionStartMs: number,
  lastPrice?: number | null,
): TrendBias {
  const vwap = sessionVwap(minutes, sessionStartMs);
  if (vwap == null) return null;
  const last =
    lastPrice != null && Number.isFinite(lastPrice)
      ? lastPrice
      : minutes[minutes.length - 1]?.close;
  if (last == null || last === vwap) return null;
  return last > vwap ? 'UP' : 'DOWN';
}

/** A trade may only lean the way the session is already leaning. */
export function directionMatchesTrend(
  direction: SignalDirection | `${SignalDirection}`,
  bias: TrendBias,
): boolean {
  if (bias == null) return true;
  return direction === 'CALL' ? bias === 'UP' : bias === 'DOWN';
}
