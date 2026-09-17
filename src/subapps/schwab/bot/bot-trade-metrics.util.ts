/**
 * Excursion math over a position's recorded bid path.
 *
 * Kept pure and dependency-free so it can be unit tested without a database,
 * matching the existing `bot-strategy.util.ts` / `bot-exit.util.ts` pattern.
 */

export interface TapeSample {
  /** Epoch ms. */
  at: number;
  optionBid: number | null;
}

export interface TradeExcursion {
  /** Best bid seen while open. */
  mfePremium: number | null;
  /** Worst bid seen while open. */
  maePremium: number | null;
  /** Milliseconds from entry to the best bid. */
  timeToMfeMs: number | null;
  /**
   * Realized gain as a share of the best gain that was available.
   *
   * Null when no favorable excursion existed — dividing by a non-positive
   * span would produce a meaningless (and often wildly negative) ratio, and
   * "we captured 0% of nothing" is not a useful signal.
   *
   * Deliberately uncapped above 1: a value over 1 means the exit filled better
   * than any sampled bid, which is a sampling-gap signal worth seeing rather
   * than hiding behind a clamp.
   */
  captureEfficiency: number | null;
  /** Tape rows that actually carried a usable bid. */
  sampleCount: number;
}

/** `${symbol}-${openedAt}` — stable for the life of one position. */
export function tradeKeyFor(symbol: string, openedAt: number): string {
  return `${symbol.trim()}-${openedAt}`;
}

export function computeTradeExcursion(params: {
  samples: TapeSample[];
  entryPrice: number;
  exitPrice: number;
  openedAt: number;
}): TradeExcursion {
  const usable = params.samples.filter(
    (s): s is TapeSample & { optionBid: number } =>
      typeof s.optionBid === 'number' &&
      Number.isFinite(s.optionBid) &&
      s.optionBid > 0,
  );

  if (!usable.length) {
    return {
      mfePremium: null,
      maePremium: null,
      timeToMfeMs: null,
      captureEfficiency: null,
      sampleCount: 0,
    };
  }

  let best = usable[0];
  let worst = usable[0];
  for (const sample of usable) {
    if (sample.optionBid > best.optionBid) best = sample;
    if (sample.optionBid < worst.optionBid) worst = sample;
  }

  const favorableSpan = best.optionBid - params.entryPrice;
  const captureEfficiency =
    favorableSpan > 0
      ? (params.exitPrice - params.entryPrice) / favorableSpan
      : null;

  return {
    mfePremium: best.optionBid,
    maePremium: worst.optionBid,
    timeToMfeMs: Math.max(0, best.at - params.openedAt),
    captureEfficiency,
    sampleCount: usable.length,
  };
}

/**
 * Round-trip P&L for a long option position, net of modeled commission.
 * Option multiplier is 100.
 */
export function computeTradePnl(params: {
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  fees: number;
}): { grossPnl: number; fees: number; netPnl: number } {
  const grossPnl =
    (params.exitPrice - params.entryPrice) * 100 * params.quantity;
  return {
    grossPnl: round4(grossPnl),
    fees: round4(params.fees),
    netPnl: round4(grossPnl - params.fees),
  };
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
