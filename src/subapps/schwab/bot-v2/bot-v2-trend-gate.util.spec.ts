import { BotCandle } from '@schwab/bot/bot-strategy.util';

import { directionMatchesTrend, trendBias } from './bot-v2-trend-gate.util';

function candles(closes: number[]): BotCandle[] {
  return closes.map((close, i) => ({
    open: close,
    high: close,
    low: close,
    close,
    volume: 0,
    chartTime: i * 60_000,
  }));
}

describe('trendBias', () => {
  it('stays open until ten minutes of bars exist', () => {
    expect(trendBias(candles([1, 2, 3, 4, 5, 6, 7, 8, 9]), 60)).toBeNull();
  });

  it('reads up when the last close is above the 20-minute average', () => {
    const rising = Array.from({ length: 25 }, (_, i) => 7700 + i);
    expect(trendBias(candles(rising), 60)).toBe('UP');
  });

  it('reads down when the last close is below the average', () => {
    const falling = Array.from({ length: 25 }, (_, i) => 7800 - i);
    expect(trendBias(candles(falling), 60)).toBe('DOWN');
  });

  it('scales the window for 15-second bars', () => {
    // 39 micro bars is under ten minutes; 40 is enough.
    const short = Array.from({ length: 39 }, (_, i) => 7700 + i);
    expect(trendBias(candles(short), 15)).toBeNull();
    const enough = Array.from({ length: 40 }, (_, i) => 7700 + i);
    expect(trendBias(candles(enough), 15)).toBe('UP');
  });

  it('uses only the last 20 minutes', () => {
    // A long decline followed by a 20-minute climb reads up.
    const closes = [
      ...Array.from({ length: 60 }, (_, i) => 7900 - i),
      ...Array.from({ length: 21 }, (_, i) => 7841 + i),
    ];
    expect(trendBias(candles(closes), 60)).toBe('UP');
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
