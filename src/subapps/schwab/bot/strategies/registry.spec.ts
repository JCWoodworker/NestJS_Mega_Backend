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

  it('fades a stretch back toward VWAP', () => {
    const candles = [
      candle(0, 100),
      candle(1, 100),
      candle(2, 100, { high: 100.2, low: 99.8 }),
      candle(3, 100),
      candle(4, 100),
      candle(5, 100),
      candle(6, 100),
      candle(7, 100),
      candle(8, 100),
      candle(9, 100),
      candle(10, 100),
      candle(11, 100),
      candle(12, 100),
      candle(13, 100),
      candle(14, 97, { high: 97.2, low: 96.5, close: 97 }),
      candle(15, 97.4, { high: 97.6, low: 96.8, close: 97.4 }),
    ];
    const ctx = buildStrategyContext(candles, SESSION_START, 14);
    const results = evaluateEnabled([BotStrategy.VWAP_REVERSION], ctx);
    expect(results.VWAP_REVERSION).toBe('CALL');
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
