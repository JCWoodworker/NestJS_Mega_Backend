import {
  aggregateRealizedTrades,
  type RealizedTradeLike,
} from './pnl-insight.util';

const OPENED = 1_700_000_000_000;

function trade(overrides: Partial<RealizedTradeLike> = {}): RealizedTradeLike {
  return {
    symbol: 'SPY   260918C00760000',
    direction: 'CALL',
    quantity: 1,
    openPrice: 1.0,
    closePrice: 1.2,
    openedAt: OPENED,
    closedAt: OPENED + 10 * 60_000,
    realizedPnl: 20,
    source: 'MANUAL_LIVE',
    ...overrides,
  };
}

describe('aggregateRealizedTrades', () => {
  it('returns a valid empty shape for no trades', () => {
    const insight = aggregateRealizedTrades([]);
    expect(insight.trades).toBe(0);
    expect(insight.winRate).toBeNull();
    expect(insight.grossPnl).toBe(0);
    expect(insight.bySource).toEqual([]);
  });

  it('sums P&L and counts wins/losses', () => {
    const insight = aggregateRealizedTrades([
      trade({ realizedPnl: 30 }),
      trade({ realizedPnl: -10 }),
      trade({ realizedPnl: 0 }),
    ]);
    expect(insight.trades).toBe(3);
    expect(insight.wins).toBe(1);
    expect(insight.losses).toBe(1);
    expect(insight.grossPnl).toBe(20);
    expect(insight.avgPnl).toBeCloseTo(6.67, 2);
    // A breakeven trade counts toward the sample but is neither a win nor a loss.
    expect(insight.winRate).toBeCloseTo(1 / 3, 4);
  });

  it('computes average and median hold time', () => {
    const insight = aggregateRealizedTrades([
      trade({ openedAt: 0, closedAt: 60_000 }),
      trade({ openedAt: 0, closedAt: 120_000 }),
      trade({ openedAt: 0, closedAt: 180_000 }),
    ]);
    expect(insight.avgHoldMs).toBe(120_000);
    expect(insight.medianHoldMs).toBe(120_000);
  });

  it('reports the best and worst trade', () => {
    const insight = aggregateRealizedTrades([
      trade({ realizedPnl: 50 }),
      trade({ realizedPnl: -75 }),
      trade({ realizedPnl: 10 }),
    ]);
    expect(insight.bestTrade).toBe(50);
    expect(insight.worstTrade).toBe(-75);
  });

  it('groups by source, biggest absolute contributor first', () => {
    const insight = aggregateRealizedTrades([
      trade({ source: 'MANUAL_LIVE', realizedPnl: 10 }),
      trade({ source: 'BOT_PAPER', realizedPnl: -200 }),
      trade({ source: 'BOT_PAPER', realizedPnl: 50 }),
    ]);
    expect(insight.bySource[0]).toMatchObject({
      source: 'BOT_PAPER',
      trades: 2,
      grossPnl: -150,
    });
    expect(insight.bySource[1]).toMatchObject({
      source: 'MANUAL_LIVE',
      trades: 1,
      grossPnl: 10,
    });
  });

  it('does not mix sources within a single bucket', () => {
    const insight = aggregateRealizedTrades([
      trade({ source: 'MANUAL_LIVE', realizedPnl: 100 }),
      trade({ source: 'BOT_LIVE', realizedPnl: 100 }),
    ]);
    const manual = insight.bySource.find((b) => b.source === 'MANUAL_LIVE');
    const bot = insight.bySource.find((b) => b.source === 'BOT_LIVE');
    expect(manual?.trades).toBe(1);
    expect(bot?.trades).toBe(1);
    // Overall bucket still combines everything.
    expect(insight.trades).toBe(2);
    expect(insight.grossPnl).toBe(200);
  });
});
