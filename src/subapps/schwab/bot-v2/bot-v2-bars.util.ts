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

/**
 * Turn each completed 1-minute bar into four 15-second bars that still
 * contain that minute's open, high, low, and close. The trainer arms at
 * 9:45, so without this the 9:30–9:35 opening range does not exist yet.
 * It is a stand-in for the path inside the minute, not a tick recording.
 */
export function expandCompletedMinutes(
  minutes: BotCandle[],
  nowMs: number,
): BotCandle[] {
  const currentMinute = Math.floor(nowMs / 60_000) * 60_000;
  const out: BotCandle[] = [];
  for (const bar of minutes) {
    if (bar.chartTime >= currentMinute) continue;
    const t = bar.chartTime;
    out.push(
      { chartTime: t, open: bar.open, high: bar.open, low: bar.open, close: bar.open, volume: 1 },
      { chartTime: t + 15_000, open: bar.high, high: bar.high, low: bar.high, close: bar.high, volume: 1 },
      { chartTime: t + 30_000, open: bar.low, high: bar.low, low: bar.low, close: bar.low, volume: 1 },
      {
        chartTime: t + 45_000,
        open: bar.close,
        high: bar.close,
        low: bar.close,
        close: bar.close,
        volume: Math.max(bar.volume, 1),
      },
    );
  }
  return out;
}
