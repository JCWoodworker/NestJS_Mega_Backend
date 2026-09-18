import { TapeSample } from './bot-trade-metrics.util';

/**
 * Pure analysis over recorded trades. No repositories, no clock, no I/O —
 * everything here is a function of its arguments so it can be tested against
 * fixtures rather than waiting for a live sample to accumulate.
 *
 * The questions are taken from the improvement-loop checkpoint doc, in its
 * stated order of leverage: is the problem exits or entries, is time-to-MFE
 * much shorter than hold time, which exit reason costs the most, what does
 * the counterfactual grid converge on, are fees material.
 */

/** One completed trade, as the analyzer needs it. */
export interface AnalyzedTrade {
  tradeKey: string;
  etDateKey: string;
  lane: string;
  direction: string | null;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  openedAt: number;
  closedAt: number;
  holdMs: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  mfePremium: number | null;
  maePremium: number | null;
  timeToMfeMs: number | null;
  captureEfficiency: number | null;
  sampleCount: number;
  exitReason: string | null;
  strategies: string[] | null;
}

export interface ExitReasonStat {
  reason: string;
  trades: number;
  netPnl: number;
  /** Mean net P&L, which is what says whether the reason is worth keeping. */
  avgNetPnl: number;
}

export interface DailyAggregate {
  etDateKey: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  grossPnl: number;
  fees: number;
  netPnl: number;
  /** Fees as a share of gross profit — "are fees material". */
  feeDragPct: number | null;
  expectancy: number | null;
  profitFactor: number | null;
  medianCaptureEfficiency: number | null;
  medianHoldMs: number | null;
  medianTimeToMfeMs: number | null;
  /** Share of trades whose premium stop never had a bid to evaluate. */
  blindTradePct: number | null;
  exitReasons: ExitReasonStat[];
}

/** One cell of the counterfactual exit-policy grid. */
export interface ExitPolicy {
  /** Exit when bid >= entry * (1 + targetPct). Null disables. */
  targetPct: number | null;
  /** Exit when bid <= entry * (1 - stopPct). Null disables. */
  stopPct: number | null;
  /** Exit after this long in the trade. Null disables. */
  timeStopMs: number | null;
  /** Exit when bid falls this far from its peak. Null disables. */
  trailPct: number | null;
}

export interface PolicyResult {
  policy: ExitPolicy;
  trades: number;
  netPnl: number;
  /** How the policy did against what actually happened. */
  deltaVsActual: number;
  wins: number;
  winRate: number | null;
}

export type ReadinessLevel = 'insufficient' | 'indicative' | 'trustworthy';

export interface Readiness {
  trades: number;
  level: ReadinessLevel;
  /** Plain-language statement of what may and may not be concluded. */
  note: string;
}

/**
 * Sample thresholds from the checkpoint doc: 30 minimum for exit-policy
 * tuning, 100+ to trust it.
 *
 * This is the gate that lets the analyzer ship before the data exists — it
 * runs every night from day one and simply reports that no conclusion is
 * valid yet, rather than emitting a confident answer drawn from four trades.
 */
export const MIN_TRADES_INDICATIVE = 30;
export const MIN_TRADES_TRUSTWORTHY = 100;

export function assessReadiness(trades: number): Readiness {
  const count = `${trades} ${trades === 1 ? 'trade' : 'trades'}`;

  if (trades < MIN_TRADES_INDICATIVE) {
    return {
      trades,
      level: 'insufficient',
      note: `${count} — under ${MIN_TRADES_INDICATIVE}, so no tuning conclusion is valid. Diagnose why the bot is not trading before reading anything else.`,
    };
  }
  if (trades < MIN_TRADES_TRUSTWORTHY) {
    return {
      trades,
      level: 'indicative',
      note: `${count} — enough to look at, not enough to act on. Treat differences under a few percent as noise.`,
    };
  }
  return {
    trades,
    level: 'trustworthy',
    note: `${count} — a policy that wins consistently here is worth proposing.`,
  };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round(value: number, dp = 4): number {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
}

export function aggregateTrades(
  etDateKey: string,
  trades: AnalyzedTrade[],
): DailyAggregate {
  const grossPnl = trades.reduce((sum, t) => sum + t.grossPnl, 0);
  const fees = trades.reduce((sum, t) => sum + t.fees, 0);
  const netPnl = trades.reduce((sum, t) => sum + t.netPnl, 0);

  const wins = trades.filter((t) => t.netPnl > 0);
  const losses = trades.filter((t) => t.netPnl < 0);
  const grossWin = wins.reduce((sum, t) => sum + t.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.netPnl, 0));

  const byReason = new Map<string, AnalyzedTrade[]>();
  for (const trade of trades) {
    const reason = trade.exitReason ?? 'UNKNOWN';
    byReason.set(reason, [...(byReason.get(reason) ?? []), trade]);
  }

  return {
    etDateKey,
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? round(wins.length / trades.length) : null,
    grossPnl: round(grossPnl, 2),
    fees: round(fees, 2),
    netPnl: round(netPnl, 2),
    // Against gross *profit*, not turnover: the question is how much of the
    // edge commission is eating.
    feeDragPct: grossPnl > 0 ? round(fees / grossPnl) : null,
    expectancy: trades.length ? round(netPnl / trades.length, 2) : null,
    // Infinite profit factor is meaningless, so a lossless sample reports
    // null rather than a number that cannot be compared.
    profitFactor: grossLoss > 0 ? round(grossWin / grossLoss) : null,
    medianCaptureEfficiency: median(
      trades
        .map((t) => t.captureEfficiency)
        .filter((v): v is number => v != null),
    ),
    medianHoldMs: median(trades.map((t) => t.holdMs)),
    medianTimeToMfeMs: median(
      trades.map((t) => t.timeToMfeMs).filter((v): v is number => v != null),
    ),
    // sampleCount 0 means the soft-exit loop never read a bid for this trade,
    // so any "the stop did not work" reading is a missing-data result rather
    // than a strategy result.
    blindTradePct: trades.length
      ? round(trades.filter((t) => t.sampleCount === 0).length / trades.length)
      : null,
    exitReasons: [...byReason.entries()]
      .map(([reason, group]) => ({
        reason,
        trades: group.length,
        netPnl: round(
          group.reduce((sum, t) => sum + t.netPnl, 0),
          2,
        ),
        avgNetPnl: round(
          group.reduce((sum, t) => sum + t.netPnl, 0) / group.length,
          2,
        ),
      }))
      // Worst total first: the single dominant loser is the highest-leverage
      // thing to fix.
      .sort((a, b) => a.netPnl - b.netPnl),
  };
}

/**
 * Replays one trade's recorded tape under an alternative exit policy, holding
 * the entry fixed.
 *
 * Holding entries fixed is the point: it isolates the exit question, which is
 * the hypothesis the whole recording layer was built to test. Exits use the
 * bid, because that is what a long position actually sells into.
 *
 * Returns null when the tape cannot support a verdict — no samples means the
 * honest answer is "unknown", not the actual result dressed up as a
 * counterfactual.
 */
export function replayExitPolicy(params: {
  trade: AnalyzedTrade;
  samples: TapeSample[];
  policy: ExitPolicy;
  /** Commission for a round trip at this size. */
  fees: number;
}): { netPnl: number; exitPrice: number; reason: string } | null {
  const { trade, policy, fees } = params;
  const samples = params.samples
    .filter((s) => s.optionBid != null)
    .sort((a, b) => a.at - b.at);
  if (!samples.length) return null;

  const target =
    policy.targetPct != null ? trade.entryPrice * (1 + policy.targetPct) : null;
  const stop =
    policy.stopPct != null ? trade.entryPrice * (1 - policy.stopPct) : null;

  let peak = trade.entryPrice;

  for (const sample of samples) {
    const bid = sample.optionBid as number;
    peak = Math.max(peak, bid);

    const elapsed = sample.at - trade.openedAt;
    let hit: string | null = null;

    // Stop before target: within one sample we cannot know which came first,
    // and assuming the favourable one is how a backtest flatters itself.
    if (stop != null && bid <= stop) hit = 'PREMIUM_STOP';
    else if (target != null && bid >= target) hit = 'PREMIUM_TARGET';
    else if (
      policy.trailPct != null &&
      bid <= peak * (1 - policy.trailPct) &&
      peak > trade.entryPrice
    ) {
      hit = 'TRAIL_STOP';
    } else if (policy.timeStopMs != null && elapsed >= policy.timeStopMs) {
      hit = 'TIME_STOP';
    }

    if (hit) {
      return {
        exitPrice: bid,
        reason: hit,
        netPnl: round(
          (bid - trade.entryPrice) * trade.quantity * 100 - fees,
          2,
        ),
      };
    }
  }

  // Never triggered — the position rides to where it actually closed.
  const last = samples[samples.length - 1].optionBid as number;
  return {
    exitPrice: last,
    reason: 'HELD_TO_CLOSE',
    netPnl: round((last - trade.entryPrice) * trade.quantity * 100 - fees, 2),
  };
}

/** Scores a set of policies across every trade that has usable tape. */
export function scorePolicies(params: {
  trades: AnalyzedTrade[];
  tapeByTradeKey: Map<string, TapeSample[]>;
  policies: ExitPolicy[];
}): PolicyResult[] {
  const { trades, tapeByTradeKey, policies } = params;

  return policies
    .map((policy) => {
      let netPnl = 0;
      let actual = 0;
      let counted = 0;
      let wins = 0;

      for (const trade of trades) {
        const samples = tapeByTradeKey.get(trade.tradeKey) ?? [];
        const replay = replayExitPolicy({
          trade,
          samples,
          policy,
          fees: trade.fees,
        });
        if (!replay) continue;
        counted += 1;
        netPnl += replay.netPnl;
        // Compare only over trades the policy could actually be scored on,
        // otherwise the delta mixes different denominators.
        actual += trade.netPnl;
        if (replay.netPnl > 0) wins += 1;
      }

      return {
        policy,
        trades: counted,
        netPnl: round(netPnl, 2),
        deltaVsActual: round(netPnl - actual, 2),
        wins,
        winRate: counted ? round(wins / counted) : null,
      };
    })
    .sort((a, b) => b.netPnl - a.netPnl);
}

/**
 * The grid to sweep.
 *
 * Deliberately coarse. A fine grid over a few dozen trades finds a winner by
 * chance, and the checkpoint doc is explicit that a winner which changes
 * every night is noise — so the resolution is kept low enough that a win has
 * to be real to show up.
 */
export function defaultPolicyGrid(): ExitPolicy[] {
  const policies: ExitPolicy[] = [];
  for (const stopPct of [0.2, 0.3, 0.4]) {
    for (const targetPct of [0.3, 0.5, 0.8]) {
      policies.push({ stopPct, targetPct, timeStopMs: null, trailPct: null });
    }
  }
  for (const timeStopMs of [4 * 60_000, 8 * 60_000, 15 * 60_000]) {
    policies.push({
      stopPct: 0.3,
      targetPct: null,
      timeStopMs,
      trailPct: null,
    });
  }
  for (const trailPct of [0.15, 0.25]) {
    policies.push({
      stopPct: 0.3,
      targetPct: null,
      timeStopMs: null,
      trailPct,
    });
  }
  return policies;
}
