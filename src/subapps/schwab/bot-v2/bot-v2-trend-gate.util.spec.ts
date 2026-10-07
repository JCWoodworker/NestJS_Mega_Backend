import { BotCandle } from '@schwab/bot/bot-strategy.util';

import {
  directionMatchesTrend,
  sessionVwap,
  trendBias,
} from './bot-v2-trend-gate.util';

const START = 1_700_000_000_000;

function minutes(
  rows: Array<{ close: number; volume?: number; high?: number; low?: number }>,
): BotCandle[] {
  return rows.map((row, i) => ({
    open: row.close,
    high: row.high ?? row.close,
    low: row.low ?? row.close,
    close: row.close,
    volume: row.volume ?? 0,
    chartTime: START + i * 60_000,
  }));
}

describe('sessionVwap', () => {
  it('stays null until ten session minutes exist', () => {
    expect(
      sessionVwap(
        minutes(Array.from({ length: 9 }, () => ({ close: 7700 }))),
        START,
      ),
    ).toBeNull();
  });

  it('uses volume when the bars have it', () => {
    const bars = minutes([
      ...Array.from({ length: 9 }, () => ({ close: 7700, volume: 1 })),
      { close: 7800, high: 7800, low: 7800, volume: 9 },
    ]);
    expect(sessionVwap(bars, START)).toBeCloseTo(
      (7700 * 9 + 7800 * 9) / 18,
      5,
    );
  });

  it('falls back to the typical-price mean when volume is missing', () => {
    const bars = minutes(Array.from({ length: 10 }, () => ({ close: 7700 })));
    expect(sessionVwap(bars, START)).toBe(7700);
  });
});

describe('trendBias', () => {
  it('reads up when spot is above session VWAP', () => {
    const bars = minutes(
      Array.from({ length: 20 }, () => ({ close: 7700, volume: 1 })),
    );
    expect(trendBias(bars, START, 7701)).toBe('UP');
  });

  it('reads down when spot is below session VWAP', () => {
    const bars = minutes(
      Array.from({ length: 20 }, () => ({ close: 7700, volume: 1 })),
    );
    expect(trendBias(bars, START, 7699)).toBe('DOWN');
  });

  it('stays open before ten minutes', () => {
    const bars = minutes(Array.from({ length: 5 }, () => ({ close: 7700 })));
    expect(trendBias(bars, START, 7800)).toBeNull();
  });
});

describe('directionMatchesTrend', () => {
  it('lets both sides through before a trend exists', () => {
    expect(directionMatchesTrend('CALL', null)).toBe(true);
    expect(directionMatchesTrend('PUT', null)).toBe(true);
  });

  it('blocks the counter-trend side', () => {
    expect(directionMatchesTrend('CALL', 'UP')).toBe(true);
    expect(directionMatchesTrend('PUT', 'UP')).toBe(false);
    expect(directionMatchesTrend('PUT', 'DOWN')).toBe(true);
    expect(directionMatchesTrend('CALL', 'DOWN')).toBe(false);
  });
});
