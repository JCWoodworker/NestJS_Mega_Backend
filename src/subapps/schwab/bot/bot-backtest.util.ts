import { OptionChainQuote } from '@schwab/market-data/option-chain.mapper';

import { pushPriceBar } from '../bot-v2/bot-v2-bars.util';
import { sameTrainerUnderlying } from '../bot-v2/bot-v2-config.util';
import {
  DEFAULT_PROFIT_LOCK,
  disasterStopBid,
  type ProfitLockLadder,
} from '../bot-v2/bot-v2-profit-lock.util';
import { sizeAtRisk } from '../bot-v2/bot-v2-sizing.util';
import { decideTickExit } from '../bot-v2/bot-v2-tick-exit.util';
import {
  directionMatchesTrend,
  trendBias,
} from '../bot-v2/bot-v2-trend-gate.util';
import { commissionForRoundTrip } from './bot-fees.const';
import {
  breakevenBidFor,
  computeExitLevels,
  decideSoftExit,
  ratchetPremiumStop,
  type SoftExitReason,
} from './bot-exit.util';
import { ChainSnapshotQuote } from './entities/bot-chain-snapshot.entity';
import {
  computeBudget,
  selectContractDetailed,
  sizePosition,
  type StrikeFilters,
} from './bot-strike-selection.util';
import { BotStrategy } from './enums/strategy.enum';
import {
  combineSignals,
  etSessionStartMs,
  isDirectionAllowed,
  type BotCandle,
  type SignalAgreement,
  type SignalDirection,
} from './bot-strategy.util';
import { buildStrategyContext, evaluateEnabled } from './strategies/registry';

/**
 * Replay a session against recorded bars and chain snapshots.
 *
 * Every decision here is made by the same function production uses —
 * `combineSignals`, `selectContractDetailed`, `sizeAtRisk` / `sizePosition`,
 * `decideTickExit` (the profit-lock ladder) or the older
 * `computeExitLevels` / `ratchetPremiumStop` / `decideSoftExit`. A replay that
 * reimplemented any of them would be measuring a bot we do not run, and would
 * be most confident exactly where it had drifted.
 *
 * The trainer path keeps one product's chain. SPY and SPX prints share a
 * session in the recorder, and treating the next print as the same underlying
 * flattens every trade at the entry price. Fifteen-second signal bars are
 * built from that chain's spot with `pushPriceBar`, the function the trainer
 * uses live. The SPY minute bars on the session are a different product.
 *
 * What it cannot reproduce: the live loop evaluates exits on every underlying
 * tick, while this sees the chain only as often as the recorder sampled it.
 * Between two samples a stop can be touched and recovered, so a replay is
 * optimistic about stops and pessimistic about nothing. Sessions recorded at
 * one-minute cadence are much weaker evidence than five-second ones, and
 * `snapshotIntervalSec` on the result says which a given run had.
 */

export interface BacktestSnapshot {
  at: number;
  spot: number | null;
  quotes: ChainSnapshotQuote[];
  expiration: string | null;
  /** Product this chain belongs to. Absent on archives written before the split. */
  underlying?: string | null;
}

export interface BacktestSession {
  etDateKey: string;
  bars: BotCandle[];
  snapshots: BacktestSnapshot[];
}

/** The knobs a replay varies. Mirrors the live settings row. */
export interface BacktestConfig {
  strategies: Array<`${BotStrategy}`>;
  combineMode: 'ANY' | 'CONFIRMING';
  /** Defaults to 1 (ANY). A number above 1 overrides combineMode. */
  minStrategyAgreement?: number;
  /**
   * When set, the replay only sees this many trailing bars. 100 reproduces
   * the pre-fix ring so a run can be compared with the full session.
   */
  maxBars?: number;
  directionsEnabled: SignalDirection[];
  filters: StrikeFilters;
  atrPeriod: number;
  cooldownMins: number;
  tradeWindowStart: string;
  tradeWindowEnd: string;
  hardFlattenTime: string;
  usePremiumStop: boolean;
  premiumStopPct: number;
  usePremiumTarget: boolean;
  premiumTargetPct: number;
  useTrailStop: boolean;
  trailArmPct: number;
  trailPct: number;
  trailMinLockPct: number;
  stopAtrMult: number;
  targetAtrMult: number;
  riskPct: number;
  equity: number;
  /**
   * Replay this product's chain only. SPXW also keeps snapshots tagged SPX.
   * Fifteen-second bars are built from that chain's spot, not from the SPY
   * minute bars stored on the session.
   */
  underlying?: 'SPY' | 'SPXW';
  /** 15 matches the trainer. 60 keeps the recorded minute bars. */
  signalBarSeconds?: 15 | 60;
  /** Set on the trainer path. The old premium target and ATR stops stay off. */
  profitLock?: ProfitLockLadder | null;
  useTimeStop?: boolean;
  timeStopSeconds?: number;
  useScaleOut?: boolean;
  paperSlippageCents?: number;
  useRiskAtStop?: boolean;
  maxRiskUsd?: number;
  settledCash?: number;
  /** Session VWAP gate the trainer applies before it buys. */
  trendGate?: boolean;
}

export interface BacktestTrade {
  etDateKey: string;
  symbol: string;
  direction: SignalDirection;
  strategies: string[];
  quantity: number;
  entryPremium: number;
  exitPremium: number;
  openedAt: number;
  closedAt: number;
  holdMs: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  exitReason:
    | SoftExitReason
    | 'TIME_STOP'
    | 'SCALE_OUT'
    | 'HARD_FLATTEN_EOD'
    | 'SESSION_END';
}

export interface BacktestResult {
  sessions: string[];
  trades: BacktestTrade[];
  tradeCount: number;
  wins: number;
  winRate: number | null;
  netPnl: number;
  grossPnl: number;
  fees: number;
  expectancy: number | null;
  /** Median seconds between chain samples — the replay's exit resolution. */
  snapshotIntervalSec: number | null;
  /**
   * Whether the sampling is coarse enough that results should not be compared
   * against live P&L. Between two samples a stop can be touched and recovered,
   * so a coarse replay under-counts stop-outs and lets winners run — the bias
   * is one-directional and can be large.
   */
  lowFidelity: boolean;
  /** Reasons a signal fired but no position opened. */
  skipped: Record<string, number>;
}

/**
 * Above this, a replay is a sketch rather than evidence. The live exit loop
 * runs on every underlying tick, so even five seconds is a simplification —
 * this only marks where the gap stops being a detail.
 */
export const LOW_FIDELITY_INTERVAL_SEC = 15;

function etHhMm(at: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(at));
}

function isRegularHours(at: number): boolean {
  const hhmm = etHhMm(at);
  return hhmm >= '09:30' && hhmm < '16:00';
}

/**
 * SPX and SPY cannot share a tape. A spot at the index is thousands; SPY is
 * not. Used only when an older archive row has no product tag.
 */
export function inferUnderlying(
  spot: number | null | undefined,
): 'SPY' | 'SPXW' | null {
  if (spot == null || !Number.isFinite(spot) || spot <= 0) return null;
  return spot >= 2_000 ? 'SPXW' : 'SPY';
}

export function snapshotMatchesUnderlying(
  snapshot: { underlying?: string | null; spot?: number | null },
  wanted: string,
): boolean {
  const tag = snapshot.underlying ?? inferUnderlying(snapshot.spot);
  if (!tag) return false;
  if (wanted === 'SPY') return tag === 'SPY';
  return sameTrainerUnderlying('SPXW', tag);
}

/** OSI root, six characters, space padded. SPX weeklies list as SPXW. */
export function osiRoot(underlying?: string | null): string {
  if (underlying === 'SPXW' || underlying === 'SPX') return 'SPXW  ';
  return 'SPY   ';
}

/** The chain the replay is allowed to see. */
export function chainSnapshots(
  session: BacktestSession,
  config: Pick<BacktestConfig, 'underlying' | 'signalBarSeconds'>,
): BacktestSnapshot[] {
  const tagged = [...session.snapshots]
    .map((snapshot) => ({
      ...snapshot,
      underlying:
        snapshot.underlying ?? inferUnderlying(snapshot.spot) ?? undefined,
    }))
    .sort((a, b) => a.at - b.at);
  const wanted =
    config.underlying ?? (config.signalBarSeconds === 15 ? 'SPXW' : undefined);
  if (!wanted) return tagged;
  return tagged.filter((snapshot) => snapshotMatchesUnderlying(snapshot, wanted));
}

/**
 * Fixed bars from spot prints. Volume is the print count, the same rule the
 * trainer uses when the index stream has no share volume. The bar still
 * forming is left off: the live book only signals on a bar that has closed.
 */
export function barsFromSpots(
  snapshots: BacktestSnapshot[],
  barSeconds: number,
): BotCandle[] {
  let current: BotCandle | null = null;
  const closed: BotCandle[] = [];
  for (const snapshot of snapshots) {
    if (snapshot.spot == null || !Number.isFinite(snapshot.spot)) continue;
    const step = pushPriceBar(current, snapshot.spot, snapshot.at, barSeconds);
    if (step.closed) closed.push(step.closed);
    current = step.current;
  }
  return closed;
}

function usesSpotBars(config: BacktestConfig): boolean {
  return config.underlying != null || config.signalBarSeconds === 15;
}

/** Rebuild chain quotes from the snapshot's positional tuples. */
export function quotesFromSnapshot(
  snapshot: BacktestSnapshot,
  expiration: string,
  underlying?: string | null,
): OptionChainQuote[] {
  const root = osiRoot(underlying ?? snapshot.underlying);
  return snapshot.quotes.map(([strike, right, delta, bid, ask]) => {
    const strikeThousandths = String(Math.round(strike * 1000)).padStart(8, '0');
    return {
      symbol: `${root}${expiration}${right === 0 ? 'C' : 'P'}${strikeThousandths}`,
      bid,
      ask,
      last: null,
      bidSize: null,
      askSize: null,
      volume: null,
      delta,
    };
  });
}

/** OSI expiration (YYMMDD) for an ET date key, for synthesised symbols. */
function osiExpiration(etDateKey: string): string {
  const [yyyy, mm, dd] = etDateKey.split('-');
  return `${yyyy.slice(2)}${mm}${dd}`;
}

function medianIntervalSec(snapshots: BacktestSnapshot[]): number | null {
  if (snapshots.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < snapshots.length; i += 1) {
    gaps.push((snapshots[i].at - snapshots[i - 1].at) / 1000);
  }
  gaps.sort((a, b) => a - b);
  return Math.round(gaps[Math.floor(gaps.length / 2)]);
}

/**
 * Bid for one contract in one snapshot, read straight off the stored tuples.
 *
 * Rebuilding all eighty quotes to look at one of them is the inner loop of the
 * whole replay: once per held snapshot, per trade, per session. At five-second
 * cadence that is thousands of snapshots a day.
 */
function bidFor(
  snapshot: BacktestSnapshot,
  strike: number,
  right: 0 | 1,
): number | null {
  for (const quote of snapshot.quotes) {
    if (quote[0] === strike && quote[1] === right) return quote[3];
  }
  return null;
}

function strikeOf(symbol: string): number {
  return Number(symbol.slice(13, 21)) / 1000;
}

function recordTrade(
  trades: BacktestTrade[],
  input: {
    session: BacktestSession;
    contractSymbol: string;
    direction: SignalDirection;
    strategies: string[];
    quantity: number;
    entryPremium: number;
    exitPremium: number;
    openedAt: number;
    closedAt: number;
    exitReason: BacktestTrade['exitReason'];
  },
): void {
  const grossPnl =
    (input.exitPremium - input.entryPremium) * input.quantity * 100;
  const fees = commissionForRoundTrip(input.quantity);
  trades.push({
    etDateKey: input.session.etDateKey,
    symbol: input.contractSymbol,
    direction: input.direction,
    strategies: input.strategies,
    quantity: input.quantity,
    entryPremium: input.entryPremium,
    exitPremium: input.exitPremium,
    openedAt: input.openedAt,
    closedAt: input.closedAt,
    holdMs: input.closedAt - input.openedAt,
    grossPnl: round2(grossPnl),
    fees,
    netPnl: round2(grossPnl - fees),
    exitReason: input.exitReason,
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function replaySession(
  session: BacktestSession,
  config: BacktestConfig,
  skipped: Record<string, number>,
): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  const snapshots = chainSnapshots(session, config);
  const built = usesSpotBars(config);
  const barSeconds = config.signalBarSeconds ?? (built ? 15 : 60);
  const barMs = barSeconds * 1000;
  const bars = (built ? barsFromSpots(snapshots, barSeconds) : session.bars)
    .filter((bar) => isRegularHours(bar.chartTime))
    .sort((a, b) => a.chartTime - b.chartTime);
  if (!bars.length || !snapshots.length) return trades;

  const sessionStartMs = built
    ? etSessionStartMs(new Date(bars[0].chartTime))
    : bars[0].chartTime;
  const minutes = (
    built ? barsFromSpots(snapshots, 60) : session.bars
  )
    .filter((bar) => isRegularHours(bar.chartTime))
    .sort((a, b) => a.chartTime - b.chartTime);
  // Prefer the expiration the recorder saw; fall back to 0DTE for the session,
  // which is the only expiry this bot trades.
  const expiration =
    snapshots.find((snapshot) => snapshot.expiration)?.expiration ??
    osiExpiration(session.etDateKey);
  const product =
    config.underlying ??
    snapshots.find((snapshot) => snapshot.underlying)?.underlying;
  let lastExitAt: number | null = null;
  let barIndex = 0;

  while (barIndex < bars.length) {
    const bar = bars[barIndex];
    const hhmm = etHhMm(bar.chartTime);
    const seen = bars.slice(0, barIndex + 1);
    const window =
      config.maxBars != null ? seen.slice(-config.maxBars) : [...seen];

    if (hhmm < config.tradeWindowStart || hhmm >= config.tradeWindowEnd) {
      barIndex += 1;
      continue;
    }
    if (
      lastExitAt != null &&
      bar.chartTime - lastExitAt < config.cooldownMins * 60_000
    ) {
      barIndex += 1;
      continue;
    }
    if (window.length < 6) {
      barIndex += 1;
      continue;
    }

    const ctx = buildStrategyContext(
      window,
      sessionStartMs,
      config.atrPeriod,
    );
    const agreement: SignalAgreement =
      (config.minStrategyAgreement ?? 1) > 1
        ? (config.minStrategyAgreement as number)
        : config.combineMode;
    const signal = combineSignals(
      config.strategies,
      evaluateEnabled(config.strategies, ctx),
      bar.chartTime,
      agreement,
    );

    if (!signal) {
      barIndex += 1;
      continue;
    }
    if (
      !isDirectionAllowed(signal.direction, {
        directionsEnabled: config.directionsEnabled,
        canBuyCalls: true,
        canBuyPuts: true,
      })
    ) {
      skipped.DIRECTION_DISABLED = (skipped.DIRECTION_DISABLED ?? 0) + 1;
      barIndex += 1;
      continue;
    }

    if (config.trendGate) {
      const closedBefore = bar.chartTime + (built ? barMs : 60_000);
      const bias = trendBias(
        minutes.filter((minute) => minute.chartTime + 60_000 <= closedBefore),
        sessionStartMs,
        bar.close,
      );
      if (!directionMatchesTrend(signal.direction, bias)) {
        skipped.AGAINST_TREND = (skipped.AGAINST_TREND ?? 0) + 1;
        barIndex += 1;
        continue;
      }
    }

    // The chain as of the bar's close is the one the live bot would have seen.
    // Built bars close on the first print of the next bucket.
    const entrySnapshotIndex = snapshots.findIndex(
      (snapshot) => snapshot.at >= bar.chartTime + (built ? barMs : 0),
    );
    if (entrySnapshotIndex === -1) break;
    const entrySnapshot = snapshots[entrySnapshotIndex];

    const { contract } = selectContractDetailed(
      quotesFromSnapshot(entrySnapshot, expiration, product),
      signal.direction,
      config.filters,
    );
    if (!contract?.ask) {
      skipped.NO_CONTRACT_MATCH = (skipped.NO_CONTRACT_MATCH ?? 0) + 1;
      barIndex += 1;
      continue;
    }

    // Entries pay the ask, plus the trainer's paper slippage when it is set.
    const entryPremium = round2(
      contract.ask + (config.paperSlippageCents ?? 0) / 100,
    );
    const ladder = config.profitLock ?? null;
    let quantity = 0;
    if (ladder) {
      const sized = sizeAtRisk({
        useRiskAtStop: config.useRiskAtStop ?? false,
        maxRiskUsd: config.maxRiskUsd ?? 0,
        ask: entryPremium,
        stopPremium: disasterStopBid(
          entryPremium,
          1,
          commissionForRoundTrip(1),
          ladder,
        ),
        settledCash: config.settledCash ?? config.equity,
        equity: config.equity,
        riskPct: config.riskPct,
      });
      quantity = sized.qty;
      if (quantity < 1) {
        const reason = sized.reason === 'OK' ? 'NO_BUDGET' : sized.reason;
        skipped[reason] = (skipped[reason] ?? 0) + 1;
        barIndex += 1;
        continue;
      }
    } else {
      quantity = sizePosition(
        computeBudget(config.equity, config.equity, config.riskPct),
        entryPremium,
      );
      if (quantity < 1) {
        skipped.SKIP_BUDGET = (skipped.SKIP_BUDGET ?? 0) + 1;
        barIndex += 1;
        continue;
      }
    }

    const levels = ladder
      ? {
          stopPremium: disasterStopBid(
            entryPremium,
            quantity,
            commissionForRoundTrip(quantity),
            ladder,
          ),
          targetPremium: null as number | null,
          stopUnderlying: null as number | null,
          targetUnderlying: null as number | null,
        }
      : computeExitLevels({
          entryPremium,
          spot: entrySnapshot.spot ?? bar.close,
          atr: ctx.atr,
          direction: signal.direction,
          usePremiumStop: config.usePremiumStop,
          premiumStopPct: config.premiumStopPct,
          usePremiumTarget: config.usePremiumTarget,
          premiumTargetPct: config.premiumTargetPct,
          stopAtrMult: config.stopAtrMult,
          targetAtrMult: config.targetAtrMult,
        });

    let stopPremium = levels.stopPremium;
    let stopSource: 'INITIAL' | 'TRAIL' = 'INITIAL';
    let peakBid: number | null = ladder ? contract.bid : null;
    let peakAt = entrySnapshot.at;
    let trailArmed = false;
    let scaledOut = false;
    let openQuantity = quantity;
    const breakevenBid = breakevenBidFor(entryPremium, quantity);

    let exitPremium: number | null = null;
    let exitAt: number | null = null;
    let exitReason: BacktestTrade['exitReason'] = 'SESSION_END';
    let lastBid: number | null = contract.bid;

    const heldStrike = strikeOf(contract.symbol);
    const heldRight: 0 | 1 = signal.direction === 'CALL' ? 0 : 1;

    for (let i = entrySnapshotIndex + 1; i < snapshots.length; i += 1) {
      const snapshot = snapshots[i];
      const optionBid = bidFor(snapshot, heldStrike, heldRight);
      const spot = snapshot.spot;

      if (etHhMm(snapshot.at) >= config.hardFlattenTime) {
        exitPremium = optionBid ?? lastBid ?? entryPremium;
        exitAt = snapshot.at;
        exitReason = 'HARD_FLATTEN_EOD';
        break;
      }

      // A print from a chain that no longer lists the strike is not a fill.
      if (optionBid == null) continue;
      lastBid = optionBid;

      if (ladder) {
        if (peakBid == null || optionBid > peakBid) peakAt = snapshot.at;
        const decision = decideTickExit({
          lock: {
            entryPremium,
            optionBid,
            peakBid,
            stopPremium,
            quantity: openQuantity,
            commissionRoundTrip: commissionForRoundTrip(openQuantity),
            ladder,
          },
          exit: {
            direction: signal.direction,
            spot: spot ?? bar.close,
            targetPremium: null,
            stopUnderlying: null,
            targetUnderlying: null,
          },
          useScaleOut: config.useScaleOut ?? false,
          scaledOut,
          quantity: openQuantity,
          entryPremium,
          useTimeStop: config.useTimeStop ?? false,
          openedAt: entrySnapshot.at,
          peakAt,
          now: snapshot.at,
          timeStopSeconds: config.timeStopSeconds,
        });
        peakBid = decision.ratchet.peakBid;
        stopPremium = decision.ratchet.stopPremium;
        if (decision.type === 'HOLD') continue;
        if (decision.type === 'SCALE_OUT') {
          recordTrade(trades, {
            session,
            contractSymbol: contract.symbol,
            direction: signal.direction,
            strategies: signal.strategies,
            quantity: decision.quantity,
            entryPremium,
            exitPremium: optionBid,
            openedAt: entrySnapshot.at,
            closedAt: snapshot.at,
            exitReason: 'SCALE_OUT',
          });
          openQuantity -= decision.quantity;
          scaledOut = true;
          continue;
        }
        exitPremium = optionBid;
        exitAt = snapshot.at;
        exitReason = decision.reason;
        break;
      }

      if (config.useTrailStop) {
        const ratcheted = ratchetPremiumStop({
          entryPremium,
          optionBid,
          peakBid,
          stopPremium,
          trailArmed,
          trailArmPct: config.trailArmPct,
          trailPct: config.trailPct,
          breakevenBid,
          minLockBid: entryPremium * (1 + config.trailMinLockPct / 100),
        });
        peakBid = ratcheted.peakBid;
        trailArmed = ratcheted.trailArmed;
        stopPremium = ratcheted.stopPremium;
        stopSource = ratcheted.source;
      }

      const reason = decideSoftExit({
        direction: signal.direction,
        spot: spot ?? bar.close,
        optionBid,
        stopPremium,
        targetPremium: levels.targetPremium,
        stopUnderlying: levels.stopUnderlying,
        targetUnderlying: levels.targetUnderlying,
        stopPremiumSource: stopSource,
      });

      if (reason) {
        // Exits hit the bid, matching the marketable STC the live path sends.
        exitPremium = optionBid;
        exitAt = snapshot.at;
        exitReason = reason;
        break;
      }
    }

    if (exitPremium == null || exitAt == null) {
      const last = snapshots[snapshots.length - 1];
      exitPremium = bidFor(last, heldStrike, heldRight) ?? lastBid ?? entryPremium;
      exitAt = last.at;
      exitReason = 'SESSION_END';
    }

    recordTrade(trades, {
      session,
      contractSymbol: contract.symbol,
      direction: signal.direction,
      strategies: signal.strategies,
      quantity: openQuantity,
      entryPremium,
      exitPremium,
      openedAt: entrySnapshot.at,
      closedAt: exitAt,
      exitReason,
    });

    lastExitAt = exitAt;
    // Resume scanning from the bar after the exit: the live bot holds one
    // position at a time, so overlapping entries would invent capital.
    const resumeIndex = bars.findIndex((b) => b.chartTime > (exitAt as number));
    if (resumeIndex === -1) break;
    barIndex = resumeIndex;
  }

  return trades;
}

export function runBacktest(
  sessions: BacktestSession[],
  config: BacktestConfig,
): BacktestResult {
  const skipped: Record<string, number> = {};
  const trades = sessions.flatMap((session) =>
    replaySession(session, config, skipped),
  );

  const wins = trades.filter((trade) => trade.netPnl > 0).length;
  const netPnl = trades.reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossPnl = trades.reduce((sum, trade) => sum + trade.grossPnl, 0);
  const fees = trades.reduce((sum, trade) => sum + trade.fees, 0);
  const intervals = sessions
    .map((session) => medianIntervalSec(chainSnapshots(session, config)))
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b);
  // Worst session governs: one coarse day is enough to make a pooled result
  // unsafe to quote.
  const snapshotIntervalSec = intervals.length
    ? intervals[intervals.length - 1]
    : null;

  return {
    sessions: sessions.map((session) => session.etDateKey),
    trades,
    tradeCount: trades.length,
    wins,
    winRate: trades.length
      ? Math.round((wins / trades.length) * 10_000) / 100
      : null,
    netPnl: Math.round(netPnl * 100) / 100,
    grossPnl: Math.round(grossPnl * 100) / 100,
    fees: Math.round(fees * 100) / 100,
    expectancy: trades.length
      ? Math.round((netPnl / trades.length) * 100) / 100
      : null,
    snapshotIntervalSec,
    lowFidelity:
      snapshotIntervalSec == null ||
      snapshotIntervalSec > LOW_FIDELITY_INTERVAL_SEC,
    skipped,
  };
}
