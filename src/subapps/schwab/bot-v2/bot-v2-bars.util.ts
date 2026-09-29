import { BotCandle } from '@schwab/bot/bot-strategy.util';

export const SIGNAL_BAR_SECONDS = [15, 60] as const;
export type SignalBarSeconds = (typeof SIGNAL_BAR_SECONDS)[number];

export function isSignalBarSeconds(value: number): value is SignalBarSeconds {
  return value === 15 || value === 60;
}

/**
 * Fold underlying prints into fixed bars. Volume is the print count so VWAP
 * still has a weight when the stream has no share volume.
 *
 * Returns the bar that just closed, if this print moved into a new bucket.
 */
export function pushPriceBar(
  current: BotCandle | null,
  price: number,
  timestampMs: number,
  barSeconds: number,
): { current: BotCandle; closed: BotCandle | null } {
  const width = barSeconds * 1000;
  const bucket = Math.floor(timestampMs / width) * width;
  if (!current || current.chartTime !== bucket) {
    const next: BotCandle = {
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 1,
      chartTime: bucket,
    };
    return { current: next, closed: current };
  }
  return {
    current: {
      open: current.open,
      high: Math.max(current.high, price),
      low: Math.min(current.low, price),
      close: price,
      volume: current.volume + 1,
      chartTime: current.chartTime,
    },
    closed: null,
  };
}
