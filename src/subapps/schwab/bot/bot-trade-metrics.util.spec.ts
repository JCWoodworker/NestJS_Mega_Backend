import {
  computeTradeExcursion,
  computeTradePnl,
  tradeKeyFor,
  type TapeSample,
} from './bot-trade-metrics.util';

const OPENED_AT = 1_700_000_000_000;

function sample(offsetMs: number, optionBid: number | null): TapeSample {
  return { at: OPENED_AT + offsetMs, optionBid };
}

describe('tradeKeyFor', () => {
  it('is stable for the same symbol and open time', () => {
    expect(tradeKeyFor('SPY   260917C00761000', OPENED_AT)).toBe(
      `SPY   260917C00761000-${OPENED_AT}`,
    );
  });

  it('trims padding so the key does not depend on OSI whitespace', () => {
    expect(tradeKeyFor('  SPY  ', 5)).toBe('SPY-5');
  });
});

describe('computeTradeExcursion', () => {
  it('finds the best and worst bid and when the best occurred', () => {
    const result = computeTradeExcursion({
      samples: [
        sample(0, 1.0),
        sample(60_000, 1.4),
        sample(120_000, 0.8),
        sample(180_000, 1.1),
      ],
      entryPrice: 1.0,
      exitPrice: 1.1,
      openedAt: OPENED_AT,
    });

    expect(result.mfePremium).toBe(1.4);
    expect(result.maePremium).toBe(0.8);
    expect(result.timeToMfeMs).toBe(60_000);
    expect(result.sampleCount).toBe(4);
  });

  it('captures the "left money on the table" ratio', () => {
    // Entry 1.00, peak 1.50, exited at 1.20 → captured 0.20 of an available 0.50.
    const result = computeTradeExcursion({
      samples: [sample(0, 1.0), sample(60_000, 1.5)],
      entryPrice: 1.0,
      exitPrice: 1.2,
      openedAt: OPENED_AT,
    });
    expect(result.captureEfficiency).toBeCloseTo(0.4, 6);
  });

  it('reports negative efficiency when the trade lost despite a favorable move', () => {
    const result = computeTradeExcursion({
      samples: [sample(0, 1.0), sample(30_000, 1.2)],
      entryPrice: 1.0,
      exitPrice: 0.8,
      openedAt: OPENED_AT,
    });
    expect(result.captureEfficiency).toBeCloseTo(-1, 6);
  });

  it('leaves efficiency null when the bid never exceeded entry', () => {
    // Dividing by a non-positive span is meaningless — "captured 0% of nothing".
    const result = computeTradeExcursion({
      samples: [sample(0, 0.9), sample(30_000, 0.7)],
      entryPrice: 1.0,
      exitPrice: 0.7,
      openedAt: OPENED_AT,
    });
    expect(result.captureEfficiency).toBeNull();
    expect(result.mfePremium).toBe(0.9);
  });

  it('does not clamp above 1 — that signals a sampling gap worth seeing', () => {
    const result = computeTradeExcursion({
      samples: [sample(0, 1.0), sample(30_000, 1.1)],
      entryPrice: 1.0,
      exitPrice: 1.3,
      openedAt: OPENED_AT,
    });
    expect(result.captureEfficiency).toBeGreaterThan(1);
  });

  it('ignores samples with a missing or zero bid', () => {
    const result = computeTradeExcursion({
      samples: [sample(0, null), sample(30_000, 0), sample(60_000, 1.2)],
      entryPrice: 1.0,
      exitPrice: 1.2,
      openedAt: OPENED_AT,
    });
    expect(result.sampleCount).toBe(1);
    expect(result.mfePremium).toBe(1.2);
  });

  it('returns all-null with no usable samples rather than fabricating metrics', () => {
    const result = computeTradeExcursion({
      samples: [sample(0, null)],
      entryPrice: 1.0,
      exitPrice: 1.2,
      openedAt: OPENED_AT,
    });
    expect(result).toEqual({
      mfePremium: null,
      maePremium: null,
      timeToMfeMs: null,
      captureEfficiency: null,
      sampleCount: 0,
    });
  });

  it('never reports a negative time-to-MFE when a sample predates the open', () => {
    const result = computeTradeExcursion({
      samples: [sample(-5_000, 2.0)],
      entryPrice: 1.0,
      exitPrice: 1.5,
      openedAt: OPENED_AT,
    });
    expect(result.timeToMfeMs).toBe(0);
  });
});

describe('computeTradePnl', () => {
  it('applies the 100x option multiplier and subtracts fees', () => {
    const result = computeTradePnl({
      entryPrice: 1.0,
      exitPrice: 1.2,
      quantity: 3,
      fees: 3.9,
    });
    expect(result.grossPnl).toBeCloseTo(60, 6);
    expect(result.netPnl).toBeCloseTo(56.1, 6);
  });

  it('turns a marginal winner into a loser once commission is counted', () => {
    // The whole reason fees are modeled: a 1c scalp on one contract does not
    // survive a round trip.
    const result = computeTradePnl({
      entryPrice: 1.0,
      exitPrice: 1.01,
      quantity: 1,
      fees: 1.3,
    });
    expect(result.grossPnl).toBeCloseTo(1, 6);
    expect(result.netPnl).toBeLessThan(0);
  });
});
