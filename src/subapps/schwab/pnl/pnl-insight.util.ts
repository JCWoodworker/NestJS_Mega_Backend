/**
 * Deep-insight aggregation over closed trades.
 *
 * Deliberately general — unlike `bot-analysis.util.ts`, this works off only
 * the fields every closed trade has (symbol, direction, quantity, prices,
 * timestamps, realized P&L, source), never bot-only columns like premium
 * stops or capture efficiency. That's what lets one function serve both a
 * user looking at their own manual + bot history and the admin overview
 * looking at everyone's — the same computation, just scoped by whose rows
 * go in.
 */

export interface RealizedTradeLike {
  symbol: string;
  direction: string;
  quantity: number;
  openPrice: number;
  closePrice: number;
  /** Epoch ms. */
  openedAt: number;
  /** Epoch ms. */
  closedAt: number;
  realizedPnl: number;
  source: string;
}

export interface PnlInsightBucket {
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  grossPnl: number;
  /** Mean P&L per trade — the number that answers "is this worth doing". */
  avgPnl: number | null;
  avgHoldMs: number | null;
  medianHoldMs: number | null;
  bestTrade: number | null;
  worstTrade: number | null;
}

export interface PnlInsightBySource extends PnlInsightBucket {
  source: string;
}

export interface PnlInsight extends PnlInsightBucket {
  bySource: PnlInsightBySource[];
}

function round(value: number, dp = 2): number {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function aggregateBucket(trades: RealizedTradeLike[]): PnlInsightBucket {
  const wins = trades.filter((t) => t.realizedPnl > 0);
  const losses = trades.filter((t) => t.realizedPnl < 0);
  const grossPnl = trades.reduce((sum, t) => sum + t.realizedPnl, 0);
  const holdTimes = trades.map((t) => t.closedAt - t.openedAt);
  const pnls = trades.map((t) => t.realizedPnl);

  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? round(wins.length / trades.length, 4) : null,
    grossPnl: round(grossPnl),
    avgPnl: trades.length ? round(grossPnl / trades.length) : null,
    avgHoldMs: holdTimes.length
      ? Math.round(holdTimes.reduce((s, v) => s + v, 0) / holdTimes.length)
      : null,
    medianHoldMs: holdTimes.length
      ? Math.round(median(holdTimes) as number)
      : null,
    bestTrade: pnls.length ? round(Math.max(...pnls)) : null,
    worstTrade: pnls.length ? round(Math.min(...pnls)) : null,
  };
}

/**
 * Aggregates a set of closed trades overall and grouped by `source`
 * (MANUAL_LIVE / BOT_LIVE / BOT_PAPER — whichever are present).
 *
 * Takes trades already filtered to the account and date range in question;
 * this function has no opinion about scope, only about the arithmetic.
 */
export function aggregateRealizedTrades(
  trades: RealizedTradeLike[],
): PnlInsight {
  const bySourceMap = new Map<string, RealizedTradeLike[]>();
  for (const trade of trades) {
    const group = bySourceMap.get(trade.source) ?? [];
    group.push(trade);
    bySourceMap.set(trade.source, group);
  }

  return {
    ...aggregateBucket(trades),
    bySource: [...bySourceMap.entries()]
      .map(([source, group]) => ({ source, ...aggregateBucket(group) }))
      // Biggest contributor first, win or lose, since that is the one worth
      // reading about first.
      .sort((a, b) => Math.abs(b.grossPnl) - Math.abs(a.grossPnl)),
  };
}
