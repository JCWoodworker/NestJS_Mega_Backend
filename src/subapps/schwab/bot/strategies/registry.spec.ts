import { BotStrategy } from '../enums/strategy.enum';
import { BotCandle, combineSignals } from '../bot-strategy.util';
import {
  buildStrategyContext,
  evaluateEnabled,
  STRATEGY_REGISTRY,
} from './registry';

const MINUTE = 60_000;
const SESSION_START = new Date('2026-09-03T13:30:00Z').getTime();

function candle(offsetMin: number, close: number, extra: Partial<BotCandle> = {}): BotCandle {
  return {
    open: close,
    high: close + 0.2,
    low: close - 0.2,
    close,
    volume: 1000,
    chartTime: SESSION_START + offsetMin * MINUTE,
    ...extra,
  };
}

describe('strategy registry', () => {
  it('ships only the two original rules enabled', () => {
    const enabled = STRATEGY_REGISTRY.filter((s) => s.defaultEnabled).map(
      (s) => s.id,
    );
    expect(enabled).toEqual([
      BotStrategy.VWAP_PULLBACK,
      BotStrategy.ORB_5M,
    ]);
  });

  it('skips VWAP reversion when the session range is already trending wide', () => {
    const candles = Array.from({ length: 20 }, (_, i) =>
      candle(i, 100 + i * 0.5, { high: 100 + i * 0.5 + 0.2, low: 99.8 }),
    );
    const ctx = buildStrategyContext(candles, SESSION_START, 14);
    const results = evaluateEnabled([BotStrategy.VWAP_REVERSION], ctx);
    expect(results.VWAP_REVERSION).toBeNull();
  });

  it('fades a stretch back toward VWAP on a chop session', () => {
    const tight = (offsetMin: number, close: number) =>
      candle(offsetMin, close, { high: close + 0.01, low: close - 0.01, close });
    const candles = [
      ...Array.from({ length: 14 }, (_, i) => tight(i, 100)),
      tight(14, 99.92),
      tight(15, 99.935),
    ];
    const ctx = buildStrategyContext(candles, SESSION_START, 14);
    const results = evaluateEnabled([BotStrategy.VWAP_REVERSION], ctx);
    expect(results.VWAP_REVERSION).toBe('CALL');
  });

  it('does not fire EMA momentum before 12:30 ET', () => {
    const candles = Array.from({ length: 30 }, (_, i) =>
      candle(i, 100 + i * 0.05, { high: 100.3 + i * 0.05, low: 99.7 }),
    );
    const ctx = buildStrategyContext(candles, SESSION_START, 14);
    const early = evaluateEnabled([BotStrategy.EMA_MOMENTUM], ctx);
    expect(early.EMA_MOMENTUM).toBeNull();

    const afternoon = buildStrategyContext(
      Array.from({ length: 30 }, (_, i) =>
        candle(180 + i, 100 + i * 0.05, {
          high: 100.3 + i * 0.05,
          low: 99.7,
        }),
      ),
      SESSION_START,
      14,
    );
    const late = evaluateEnabled([BotStrategy.EMA_MOMENTUM], afternoon);
    expect(late.EMA_MOMENTUM).toBe('CALL');
  });

  it('requires two strategies to agree when minAgreement is 2', () => {
    expect(
      combineSignals(
        [BotStrategy.VWAP_PULLBACK, BotStrategy.ORB_5M, BotStrategy.EMA_MOMENTUM],
        {
          VWAP_PULLBACK: 'CALL',
          ORB_5M: 'CALL',
          EMA_MOMENTUM: null,
        },
        1000,
        2,
      )?.strategies,
    ).toEqual([BotStrategy.VWAP_PULLBACK, BotStrategy.ORB_5M]);

    expect(
      combineSignals(
        [BotStrategy.VWAP_PULLBACK, BotStrategy.ORB_5M],
        { VWAP_PULLBACK: 'CALL', ORB_5M: 'PUT' },
        1000,
        2,
      ),
    ).toBeNull();
  });
});
