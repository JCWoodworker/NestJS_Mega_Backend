import {
  aggregateTrades,
  assessReadiness,
  defaultPolicyGrid,
  replayExitPolicy,
  scorePolicies,
  MIN_TRADES_INDICATIVE,
  MIN_TRADES_TRUSTWORTHY,
  type AnalyzedTrade,
} from './bot-analysis.util';

const OPENED = 1_700_000_000_000;

function trade(overrides: Partial<AnalyzedTrade> = {}): AnalyzedTrade {
  return {
    tradeKey: 'SPY-1',
    etDateKey: '2026-09-18',
    lane: 'BOT_PAPER',
    direction: 'CALL',
    quantity: 1,
    entryPrice: 1.0,
    exitPrice: 1.2,
    openedAt: OPENED,
    closedAt: OPENED + 10 * 60_000,
    holdMs: 10 * 60_000,
    grossPnl: 20,
    fees: 1.3,
    netPnl: 18.7,
    mfePremium: 1.5,
    maePremium: 0.9,
    timeToMfeMs: 3 * 60_000,
    captureEfficiency: 0.4,
    sampleCount: 20,
    exitReason: 'PREMIUM_TARGET',
    strategies: ['VWAP_PULLBACK'],
    ...overrides,
  };
}

function tape(bids: number[], stepMs = 60_000) {
  return bids.map((optionBid, i) => ({
    at: OPENED + i * stepMs,
    optionBid,
  }));
}

describe('assessReadiness', () => {
  /**
   * This gate is what lets the analyzer ship before any data exists: it runs
   * from day one and reports that nothing can be concluded yet, rather than
   * emitting a confident answer drawn from four trades.
   */
  it('refuses to draw conclusions under the minimum sample', () => {
    expect(assessReadiness(0).level).toBe('insufficient');
    expect(assessReadiness(MIN_TRADES_INDICATIVE - 1).level).toBe(
      'insufficient',
    );
    expect(assessReadiness(0).note).toMatch(/no tuning conclusion is valid/i);
  });

  it('treats the middle band as indicative only', () => {
    expect(assessReadiness(MIN_TRADES_INDICATIVE).level).toBe('indicative');
    expect(assessReadiness(MIN_TRADES_TRUSTWORTHY - 1).level).toBe(
      'indicative',
    );
  });

  it('trusts a large enough sample', () => {
    expect(assessReadiness(MIN_TRADES_TRUSTWORTHY).level).toBe('trustworthy');
  });
});

describe('aggregateTrades', () => {
  it('returns an empty-but-valid shape for no trades', () => {
    const agg = aggregateTrades('2026-09-18', []);
    expect(agg.trades).toBe(0);
    expect(agg.winRate).toBeNull();
    expect(agg.netPnl).toBe(0);
    expect(agg.exitReasons).toEqual([]);
  });

  it('sums P&L and counts wins and losses', () => {
    const agg = aggregateTrades('2026-09-18', [
      trade({ netPnl: 20, grossPnl: 21.3, fees: 1.3 }),
      trade({ tradeKey: 'SPY-2', netPnl: -10, grossPnl: -8.7, fees: 1.3 }),
    ]);
    expect(agg.trades).toBe(2);
    expect(agg.wins).toBe(1);
    expect(agg.losses).toBe(1);
    expect(agg.winRate).toBe(0.5);
    expect(agg.netPnl).toBe(10);
    expect(agg.fees).toBe(2.6);
    expect(agg.expectancy).toBe(5);
  });

  it('computes profit factor, and nulls it when there are no losses', () => {
    expect(
      aggregateTrades('2026-09-18', [
        trade({ netPnl: 30 }),
        trade({ tradeKey: 'b', netPnl: -10 }),
      ]).profitFactor,
    ).toBe(3);

    // Infinite profit factor cannot be compared to anything, so it reports
    // null rather than a misleading number.
    expect(
      aggregateTrades('2026-09-18', [trade({ netPnl: 30 })]).profitFactor,
    ).toBeNull();
  });

  /** The original hypothesis: are we finding good trades and giving it back. */
  it('reports median capture efficiency', () => {
    const agg = aggregateTrades('2026-09-18', [
      trade({ captureEfficiency: 0.2 }),
      trade({ tradeKey: 'b', captureEfficiency: 0.4 }),
      trade({ tradeKey: 'c', captureEfficiency: 0.9 }),
    ]);
    expect(agg.medianCaptureEfficiency).toBe(0.4);
  });

  it('ignores trades with no capture efficiency rather than treating them as zero', () => {
    const agg = aggregateTrades('2026-09-18', [
      trade({ captureEfficiency: 0.5 }),
      trade({ tradeKey: 'b', captureEfficiency: null }),
    ]);
    expect(agg.medianCaptureEfficiency).toBe(0.5);
  });

  /**
   * A trade with no tape samples means the premium stop was never evaluated,
   * so "the stop did not work" would be a missing-data result rather than a
   * strategy result.
   */
  it('flags blind trades where the stop never had a bid', () => {
    const agg = aggregateTrades('2026-09-18', [
      trade({ sampleCount: 0 }),
      trade({ tradeKey: 'b', sampleCount: 12 }),
      trade({ tradeKey: 'c', sampleCount: 5 }),
      trade({ tradeKey: 'd', sampleCount: 5 }),
    ]);
    expect(agg.blindTradePct).toBe(0.25);
  });

  it('attributes P&L by exit reason, worst total first', () => {
    const agg = aggregateTrades('2026-09-18', [
      trade({ exitReason: 'PREMIUM_TARGET', netPnl: 20 }),
      trade({ tradeKey: 'b', exitReason: 'PREMIUM_STOP', netPnl: -15 }),
      trade({ tradeKey: 'c', exitReason: 'PREMIUM_STOP', netPnl: -25 }),
    ]);
    expect(agg.exitReasons[0]).toEqual({
      reason: 'PREMIUM_STOP',
      trades: 2,
      netPnl: -40,
      avgNetPnl: -20,
    });
    expect(agg.exitReasons[1].reason).toBe('PREMIUM_TARGET');
  });

  it('buckets a missing exit reason rather than dropping the trade', () => {
    const agg = aggregateTrades('2026-09-18', [trade({ exitReason: null })]);
    expect(agg.exitReasons[0].reason).toBe('UNKNOWN');
  });

  it('expresses fee drag against gross profit', () => {
    const agg = aggregateTrades('2026-09-18', [
      trade({ grossPnl: 100, fees: 10, netPnl: 90 }),
    ]);
    expect(agg.feeDragPct).toBe(0.1);
    // A losing day has no gross profit for fees to be a share of.
    expect(
      aggregateTrades('2026-09-18', [trade({ grossPnl: -50, fees: 10 })])
        .feeDragPct,
    ).toBeNull();
  });
});

describe('replayExitPolicy', () => {
  it('exits at the target when the bid reaches it', () => {
    const result = replayExitPolicy({
      trade: trade(),
      samples: tape([1.0, 1.2, 1.6]),
      policy: {
        targetPct: 0.5,
        stopPct: null,
        timeStopMs: null,
        trailPct: null,
      },
      fees: 1.3,
    });
    expect(result?.reason).toBe('PREMIUM_TARGET');
    expect(result?.exitPrice).toBe(1.6);
    // (1.6 - 1.0) * 1 * 100 - 1.3
    expect(result?.netPnl).toBe(58.7);
  });

  it('exits at the stop when the bid falls to it', () => {
    const result = replayExitPolicy({
      trade: trade(),
      samples: tape([1.0, 0.9, 0.6]),
      policy: {
        targetPct: null,
        stopPct: 0.3,
        timeStopMs: null,
        trailPct: null,
      },
      fees: 1.3,
    });
    expect(result?.reason).toBe('PREMIUM_STOP');
    expect(result?.netPnl).toBe(-41.3);
  });

  /**
   * Within one sample we cannot know which level was touched first, and
   * assuming the favourable one is exactly how a backtest flatters itself.
   */
  it('resolves an ambiguous sample against the trade', () => {
    const result = replayExitPolicy({
      trade: trade(),
      samples: [{ at: OPENED, optionBid: 0.5 }],
      policy: {
        targetPct: 0.1,
        stopPct: 0.1,
        timeStopMs: null,
        trailPct: null,
      },
      fees: 1.3,
    });
    expect(result?.reason).toBe('PREMIUM_STOP');
  });

  it('applies a time stop', () => {
    const result = replayExitPolicy({
      trade: trade(),
      samples: tape([1.0, 1.05, 1.1, 1.1]),
      policy: {
        targetPct: null,
        stopPct: null,
        timeStopMs: 2 * 60_000,
        trailPct: null,
      },
      fees: 1.3,
    });
    expect(result?.reason).toBe('TIME_STOP');
    expect(result?.exitPrice).toBe(1.1);
  });

  it('trails from the peak, not from entry', () => {
    const result = replayExitPolicy({
      trade: trade(),
      samples: tape([1.0, 2.0, 1.5]),
      policy: {
        targetPct: null,
        stopPct: null,
        timeStopMs: null,
        trailPct: 0.2,
      },
      fees: 1.3,
    });
    // Peak 2.0, trail 20% -> exit at/below 1.6, so 1.5 triggers.
    expect(result?.reason).toBe('TRAIL_STOP');
    expect(result?.exitPrice).toBe(1.5);
  });

  it('does not trail before the position is ever profitable', () => {
    const result = replayExitPolicy({
      trade: trade(),
      samples: tape([0.95, 0.9]),
      policy: {
        targetPct: null,
        stopPct: null,
        timeStopMs: null,
        trailPct: 0.2,
      },
      fees: 1.3,
    });
    expect(result?.reason).toBe('HELD_TO_CLOSE');
  });

  it('holds to the last sample when nothing triggers', () => {
    const result = replayExitPolicy({
      trade: trade(),
      samples: tape([1.0, 1.1]),
      policy: { targetPct: 5, stopPct: 0.99, timeStopMs: null, trailPct: null },
      fees: 1.3,
    });
    expect(result?.reason).toBe('HELD_TO_CLOSE');
    expect(result?.exitPrice).toBe(1.1);
  });

  /**
   * "Unknown" must not be reported as the actual result dressed up as a
   * counterfactual, which would make a policy look identical to reality.
   */
  it('returns null when the tape cannot support a verdict', () => {
    expect(
      replayExitPolicy({
        trade: trade(),
        samples: [],
        policy: {
          targetPct: 0.5,
          stopPct: 0.3,
          timeStopMs: null,
          trailPct: null,
        },
        fees: 1.3,
      }),
    ).toBeNull();

    expect(
      replayExitPolicy({
        trade: trade(),
        samples: [{ at: OPENED, optionBid: null }],
        policy: {
          targetPct: 0.5,
          stopPct: 0.3,
          timeStopMs: null,
          trailPct: null,
        },
        fees: 1.3,
      }),
    ).toBeNull();
  });

  it('scales by contract quantity', () => {
    const result = replayExitPolicy({
      trade: trade({ quantity: 3 }),
      samples: tape([1.0, 1.5]),
      policy: {
        targetPct: 0.5,
        stopPct: null,
        timeStopMs: null,
        trailPct: null,
      },
      fees: 3.9,
    });
    // (1.5 - 1.0) * 3 * 100 - 3.9
    expect(result?.netPnl).toBe(146.1);
  });
});

describe('scorePolicies', () => {
  it('ranks policies by net P&L and reports the delta against reality', () => {
    const t = trade({ netPnl: 10 });
    // Rises then gives it back, so taking the target genuinely beats holding.
    // A tape that ends at its peak would score both policies identically.
    const results = scorePolicies({
      trades: [t],
      tapeByTradeKey: new Map([[t.tradeKey, tape([1.0, 1.6, 1.1])]]),
      policies: [
        { targetPct: 0.5, stopPct: null, timeStopMs: null, trailPct: null },
        { targetPct: 5, stopPct: 0.99, timeStopMs: null, trailPct: null },
      ],
    });

    // Target exit at 1.6 -> 58.7; held to the last sample 1.1 -> 8.7.
    expect(results[0].netPnl).toBe(58.7);
    expect(results[1].netPnl).toBe(8.7);
    expect(results[0].deltaVsActual).toBe(48.7); // 58.7 replayed vs 10 actual
    expect(results[0].trades).toBe(1);
  });

  /** The delta must not mix denominators across different trade counts. */
  it('scores only trades with usable tape', () => {
    const withTape = trade({ tradeKey: 'a', netPnl: 5 });
    const withoutTape = trade({ tradeKey: 'b', netPnl: 1000 });

    const results = scorePolicies({
      trades: [withTape, withoutTape],
      tapeByTradeKey: new Map([[withTape.tradeKey, tape([1.0, 1.6])]]),
      policies: [
        { targetPct: 0.5, stopPct: null, timeStopMs: null, trailPct: null },
      ],
    });

    expect(results[0].trades).toBe(1);
    // 58.7 replayed against only the 5 it could be compared with.
    expect(results[0].deltaVsActual).toBe(53.7);
  });

  it('handles an empty trade set', () => {
    const results = scorePolicies({
      trades: [],
      tapeByTradeKey: new Map(),
      policies: defaultPolicyGrid(),
    });
    expect(results).toHaveLength(defaultPolicyGrid().length);
    expect(results.every((r) => r.trades === 0 && r.netPnl === 0)).toBe(true);
    expect(results.every((r) => r.winRate === null)).toBe(true);
  });
});

describe('defaultPolicyGrid', () => {
  /**
   * Coarse on purpose: a fine grid over a few dozen trades finds a winner by
   * chance, and a winner that changes nightly is noise.
   */
  it('stays small enough that a win has to be real', () => {
    const grid = defaultPolicyGrid();
    expect(grid.length).toBeLessThanOrEqual(20);
    expect(new Set(grid.map((p) => JSON.stringify(p))).size).toBe(grid.length);
  });
});
