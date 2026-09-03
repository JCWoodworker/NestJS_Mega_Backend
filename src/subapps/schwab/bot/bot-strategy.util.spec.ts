import {
  combineSignals,
  computeAtr,
  computeOrbRange,
  computeVwap,
  evaluateOrb5m,
  evaluateVwapPullback,
  isAtOrPast,
  isWithinWindow,
  BotCandle,
} from './bot-strategy.util';

const MINUTE = 60_000;
const SESSION_START = new Date('2026-09-03T13:30:00Z').getTime(); // 9:30 ET

function candle(
  partial: Partial<BotCandle> & { chartTime: number },
): BotCandle {
  return {
    open: 100,
    high: 100,
    low: 100,
    close: 100,
    volume: 1000,
    ...partial,
  };
}

describe('computeVwap', () => {
  it('volume-weights typical price across the session', () => {
    const candles = [
      candle({
        chartTime: SESSION_START,
        high: 101,
        low: 99,
        close: 100,
        volume: 100,
      }),
      candle({
        chartTime: SESSION_START + MINUTE,
        high: 103,
        low: 101,
        close: 102,
        volume: 300,
      }),
    ];
    const vwap = computeVwap(candles, SESSION_START);
    expect(vwap).toBeCloseTo((100 * 100 + 102 * 300) / 400, 5);
  });

  it('ignores candles before session start', () => {
    const candles = [
      candle({
        chartTime: SESSION_START - MINUTE,
        high: 500,
        low: 500,
        close: 500,
        volume: 999,
      }),
      candle({
        chartTime: SESSION_START,
        high: 100,
        low: 100,
        close: 100,
        volume: 10,
      }),
    ];
    expect(computeVwap(candles, SESSION_START)).toBeCloseTo(100, 5);
  });

  it('returns null with no volume', () => {
    expect(computeVwap([], SESSION_START)).toBeNull();
  });
});

describe('computeAtr', () => {
  it('returns null when there are not enough candles', () => {
    const candles = [candle({ chartTime: SESSION_START })];
    expect(computeAtr(candles, 14)).toBeNull();
  });

  it('computes a positive ATR for a trending series', () => {
    const candles = Array.from({ length: 20 }, (_, i) =>
      candle({
        chartTime: SESSION_START + i * MINUTE,
        high: 100 + i + 1,
        low: 100 + i - 1,
        close: 100 + i,
      }),
    );
    const atr = computeAtr(candles, 14);
    expect(atr).not.toBeNull();
    expect(atr!).toBeGreaterThan(0);
  });
});

describe('computeOrbRange', () => {
  it('returns null with fewer than 3 bars in the opening range', () => {
    const candles = [candle({ chartTime: SESSION_START })];
    expect(computeOrbRange(candles, SESSION_START)).toBeNull();
  });

  it('computes high/low over the first 5 minutes only', () => {
    const candles = [
      candle({ chartTime: SESSION_START, high: 105, low: 95 }),
      candle({ chartTime: SESSION_START + MINUTE, high: 110, low: 90 }),
      candle({ chartTime: SESSION_START + 2 * MINUTE, high: 106, low: 96 }),
      // Outside the 5-minute ORB window — must not affect the range.
      candle({ chartTime: SESSION_START + 10 * MINUTE, high: 999, low: 1 }),
    ];
    expect(computeOrbRange(candles, SESSION_START)).toEqual({
      high: 110,
      low: 90,
    });
  });
});

describe('evaluateVwapPullback', () => {
  it('returns null without vwap/atr or too few candles', () => {
    expect(evaluateVwapPullback([], null, null)).toBeNull();
  });

  it('returns null with fewer than 5 candles even with vwap/atr present', () => {
    const candles = [
      candle({ chartTime: SESSION_START, close: 100.5, low: 99 }),
    ];
    expect(evaluateVwapPullback(candles, 100, 4)).toBeNull();
  });

  it('signals CALL on an uptrend pullback into VWAP', () => {
    // vwap=100, atr=4 -> band=1. prev.close(99.5) <= 101, last.close(100.5)
    // is > vwap and within the band, and >= prev.low(99).
    const candles = [
      candle({ chartTime: SESSION_START, close: 98 }),
      candle({ chartTime: SESSION_START + MINUTE, close: 98.5 }),
      candle({ chartTime: SESSION_START + 2 * MINUTE, close: 99 }),
      candle({ chartTime: SESSION_START + 3 * MINUTE, close: 99.5, low: 99 }),
      candle({ chartTime: SESSION_START + 4 * MINUTE, close: 100.5, low: 100 }),
    ];
    expect(evaluateVwapPullback(candles, 100, 4)).toBe('CALL');
  });

  it('signals PUT on a downtrend pullback into VWAP', () => {
    const candles = [
      candle({ chartTime: SESSION_START, close: 102 }),
      candle({ chartTime: SESSION_START + MINUTE, close: 101.5 }),
      candle({ chartTime: SESSION_START + 2 * MINUTE, close: 101 }),
      candle({
        chartTime: SESSION_START + 3 * MINUTE,
        close: 100.5,
        high: 101,
      }),
      candle({ chartTime: SESSION_START + 4 * MINUTE, close: 99.5, high: 100 }),
    ];
    expect(evaluateVwapPullback(candles, 100, 4)).toBe('PUT');
  });

  it('returns null when price is far outside the ATR band', () => {
    const candles = [
      candle({ chartTime: SESSION_START, close: 90 }),
      candle({ chartTime: SESSION_START + MINUTE, close: 90 }),
      candle({ chartTime: SESSION_START + 2 * MINUTE, close: 90 }),
      candle({ chartTime: SESSION_START + 3 * MINUTE, close: 90 }),
      candle({ chartTime: SESSION_START + 4 * MINUTE, close: 90 }),
    ];
    expect(evaluateVwapPullback(candles, 100, 4)).toBeNull();
  });
});

describe('evaluateOrb5m', () => {
  it('returns CALL on breakout above range high', () => {
    const candles = [
      candle({ chartTime: SESSION_START + 10 * MINUTE, close: 120 }),
    ];
    expect(evaluateOrb5m(candles, { high: 110, low: 90 })).toBe('CALL');
  });

  it('returns PUT on breakdown below range low', () => {
    const candles = [
      candle({ chartTime: SESSION_START + 10 * MINUTE, close: 80 }),
    ];
    expect(evaluateOrb5m(candles, { high: 110, low: 90 })).toBe('PUT');
  });

  it('returns null inside the range', () => {
    const candles = [
      candle({ chartTime: SESSION_START + 10 * MINUTE, close: 100 }),
    ];
    expect(evaluateOrb5m(candles, { high: 110, low: 90 })).toBeNull();
  });

  it('returns null with no range', () => {
    expect(evaluateOrb5m([], null)).toBeNull();
  });
});

describe('combineSignals', () => {
  it('returns null when no strategies enabled', () => {
    expect(combineSignals([], {})).toBeNull();
  });

  it('fires when all enabled strategies agree (CONFIRMING)', () => {
    const result = combineSignals(
      ['VWAP_PULLBACK', 'ORB_5M'],
      { VWAP_PULLBACK: 'CALL', ORB_5M: 'CALL' },
      1000,
    );
    expect(result).toMatchObject({
      at: 1000,
      strategies: ['VWAP_PULLBACK', 'ORB_5M'],
      direction: 'CALL',
    });
  });

  it('does not fire when strategies disagree', () => {
    expect(
      combineSignals(['VWAP_PULLBACK', 'ORB_5M'], {
        VWAP_PULLBACK: 'CALL',
        ORB_5M: 'PUT',
      }),
    ).toBeNull();
  });

  it('does not fire when an enabled strategy has no signal', () => {
    expect(
      combineSignals(['VWAP_PULLBACK', 'ORB_5M'], { VWAP_PULLBACK: 'CALL' }),
    ).toBeNull();
  });

  it('fires with a single enabled strategy', () => {
    const result = combineSignals(['ORB_5M'], { ORB_5M: 'PUT' });
    expect(result?.direction).toBe('PUT');
  });
});

describe('window helpers', () => {
  it('isWithinWindow is inclusive of start, exclusive of end', () => {
    expect(isWithinWindow('10:00', '10:00', '15:00')).toBe(true);
    expect(isWithinWindow('14:59', '10:00', '15:00')).toBe(true);
    expect(isWithinWindow('15:00', '10:00', '15:00')).toBe(false);
    expect(isWithinWindow('09:59', '10:00', '15:00')).toBe(false);
  });

  it('isAtOrPast', () => {
    expect(isAtOrPast('15:30', '15:30')).toBe(true);
    expect(isAtOrPast('15:31', '15:30')).toBe(true);
    expect(isAtOrPast('15:29', '15:30')).toBe(false);
  });
});
