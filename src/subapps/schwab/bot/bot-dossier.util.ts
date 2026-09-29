import {
  AnalyzedTrade,
  RapidScalpReplay,
  scoreRapidScalpReplay,
} from './bot-analysis.util';
import { TapeSample } from './bot-trade-metrics.util';

/**
 * The weekly evidence file the improvement agent reads.
 *
 * Deliberately wider than the exit-policy replay that came before it. That
 * replay holds entries fixed and can only ask "given this trade, was there a
 * better exit?" — so a week lost on bad entries, or on setups the gates
 * refused, comes back with nothing to say. Most of what follows describes
 * decisions rather than outcomes: which strategy fired, what the gates turned
 * away, which contracts the filters could not match, and what the tape looked
 * like on the days involved.
 *
 * Pure functions of their arguments, as with `bot-analysis.util`, so the whole
 * thing can be tested against fixtures instead of a live week.
 */

/** One `bot_events` row, reduced to what the census needs. */
export interface DossierEvent {
  at: number;
  type: string;
  reason: string | null;
  strategies: string[] | null;
  direction: string | null;
  payload: Record<string, unknown> | null;
}

/** `[chartTime, open, high, low, close, volume]`, as stored on bot_market_days. */
export type DossierBar = [number, number, number, number, number, number];

export interface DossierSession {
  etDateKey: string;
  bars: DossierBar[];
  fullSession: boolean;
}

export interface DossierSettingsSnapshot {
  at: number;
  etDateKey: string;
  source: string;
  settings: Record<string, unknown> | null;
}

export interface SessionSummary {
  etDateKey: string;
  trades: number;
  wins: number;
  netPnl: number;
  winRate: number | null;
}

export interface StrategySplit {
  /** Strategy tag, or `UNATTRIBUTED` when the trade carried none. */
  strategy: string;
  direction: string;
  trades: number;
  wins: number;
  netPnl: number;
  avgNetPnl: number;
  winRate: number | null;
}

export interface SkipCount {
  type: string;
  reason: string;
  count: number;
}

export interface ContractMiss {
  /** Filter that rejected candidates: `delta`, `premium`, `spread`, `noQuote`. */
  constraint: string;
  /** Signals where this filter rejected at least one candidate. */
  signals: number;
  /** Total candidate contracts this filter removed. */
  contractsRejected: number;
}

export interface TimeBucket {
  /** ET `HH:MM` start of a 30-minute bucket. */
  etBucket: string;
  trades: number;
  wins: number;
  netPnl: number;
  winRate: number | null;
}

export interface ExcursionProfile {
  trades: number;
  medianCaptureEfficiency: number | null;
  medianHoldMs: number | null;
  medianTimeToMfeMs: number | null;
  /** Trades whose best bid never exceeded entry — entries with no edge at all. */
  neverProfitable: number;
  /** Trades that went favourable, then closed at a loss. */
  gaveBackAWinner: number;
  /** Trades with no usable bid samples, so their stop was never evaluable. */
  blindTrades: number;
}

/** All figures cover regular trading hours only — see `isRegularHours`. */
export interface SessionContext {
  etDateKey: string;
  open: number | null;
  close: number | null;
  high: number | null;
  low: number | null;
  /** High minus low, in points — the day's whole opportunity. */
  rangePoints: number | null;
  /** Close minus open: sign and size of the day's drift. */
  driftPoints: number | null;
  /** Mean absolute 1-minute change, a cheap proxy for chop versus trend. */
  meanAbsBarMove: number | null;
  /** Regular-hours bars only, so 390 is a complete session. */
  barCount: number;
  fullSession: boolean;
}

export interface ConfigWindow {
  configVersion: string;
  firstTradeEt: string;
  lastTradeEt: string;
  trades: number;
  netPnl: number;
}

export interface WeeklyDossier {
  weekEndingEt: string;
  generatedAt: number;
  sessions: SessionSummary[];
  strategyPerformance: StrategySplit[];
  /** Signals that became fills, and the gates that stopped the rest. */
  signalFunnel: {
    signals: number;
    entrySubmits: number;
    entryFills: number;
    /** Fills as a share of signals — where intent is lost after a setup fires. */
    fillRate: number | null;
  };
  skipCensus: SkipCount[];
  contractMisses: ContractMiss[];
  excursion: ExcursionProfile;
  timeOfDay: TimeBucket[];
  sessionContext: SessionContext[];
  configWindows: ConfigWindow[];
  /**
   * Fee-aware 1% exit replay on the entries that already happened.
   * Absent tape yields a scored-zero block rather than a silent omission.
   */
  rapidScalpReplay: RapidScalpReplay;
  notes: string[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function rate(part: number, whole: number): number | null {
  return whole > 0 ? round2((part / whole) * 100) : null;
}

function etHhMmOf(at: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(at));
}

/** ET `HH:MM` rounded down to a 30-minute bucket. */
export function etHalfHourBucket(at: number): string {
  const [hh, mm] = etHhMmOf(at).split(':');
  return `${hh}:${Number(mm) < 30 ? '00' : '30'}`;
}

/**
 * Regular trading hours, which is the only window the bot can enter in.
 * Stored bars include pre- and post-market, so a range taken over the raw
 * array describes a session the strategy never had access to.
 */
function isRegularHours(at: number): boolean {
  const hhmm = etHhMmOf(at);
  return hhmm >= '09:30' && hhmm < '16:00';
}

function summarizeSessions(trades: AnalyzedTrade[]): SessionSummary[] {
  const byDay = new Map<string, AnalyzedTrade[]>();
  for (const trade of trades) {
    byDay.set(trade.etDateKey, [...(byDay.get(trade.etDateKey) ?? []), trade]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([etDateKey, day]) => {
      const wins = day.filter((trade) => trade.netPnl > 0).length;
      return {
        etDateKey,
        trades: day.length,
        wins,
        netPnl: round2(day.reduce((sum, trade) => sum + trade.netPnl, 0)),
        winRate: rate(wins, day.length),
      };
    });
}

/**
 * Split by strategy *and* direction, because the two live strategies are
 * directional in different ways: a mean-reversion pullback and a breakout
 * continuation can easily net out to "flat" when pooled, hiding that one side
 * pays for the other.
 *
 * A trade tagged with two strategies counts under both. The tags record which
 * rules agreed, and attributing the P&L to only the first would misstate them.
 */
function splitByStrategy(trades: AnalyzedTrade[]): StrategySplit[] {
  const buckets = new Map<string, AnalyzedTrade[]>();
  for (const trade of trades) {
    const tags = trade.strategies?.length
      ? trade.strategies
      : ['UNATTRIBUTED'];
    const direction = trade.direction ?? 'UNKNOWN';
    for (const tag of tags) {
      const key = `${tag}|${direction}`;
      buckets.set(key, [...(buckets.get(key) ?? []), trade]);
    }
  }
  return [...buckets.entries()]
    .map(([key, group]) => {
      const [strategy, direction] = key.split('|');
      const wins = group.filter((trade) => trade.netPnl > 0).length;
      const netPnl = group.reduce((sum, trade) => sum + trade.netPnl, 0);
      return {
        strategy,
        direction,
        trades: group.length,
        wins,
        netPnl: round2(netPnl),
        avgNetPnl: round2(netPnl / group.length),
        winRate: rate(wins, group.length),
      };
    })
    .sort((a, b) => a.netPnl - b.netPnl);
}

/**
 * What the bot decided not to do.
 *
 * This is the half of the record the old packet ignored entirely. A week with
 * twelve trades and four hundred refusals is a different problem from a week
 * with twelve trades and twelve setups, and only this distinguishes them.
 */
function censusSkips(events: DossierEvent[]): SkipCount[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (!['GATE_SKIP', 'NO_SIGNAL', 'SKIP'].includes(event.type)) continue;
    const key = `${event.type}|${event.reason ?? 'UNSPECIFIED'}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => {
      const [type, reason] = key.split('|');
      return { type, reason, count };
    })
    .sort((a, b) => b.count - a.count);
}

/**
 * Why the strike filters came back empty.
 *
 * A signal that fires and then finds no contract is a filter problem, not a
 * strategy problem, and the two have opposite fixes — so the diagnostics the
 * engine already attaches are summarised rather than left in raw payloads.
 */
function summarizeContractMisses(events: DossierEvent[]): ContractMiss[] {
  const signals = new Map<string, number>();
  const rejected = new Map<string, number>();

  for (const event of events) {
    if (event.reason !== 'NO_CONTRACT_MATCH') continue;
    const rejects = (event.payload?.rejects ?? {}) as Record<string, unknown>;
    for (const [constraint, raw] of Object.entries(rejects)) {
      const count = Number(raw);
      if (!Number.isFinite(count) || count <= 0) continue;
      signals.set(constraint, (signals.get(constraint) ?? 0) + 1);
      rejected.set(constraint, (rejected.get(constraint) ?? 0) + count);
    }
  }

  return [...rejected.entries()]
    .map(([constraint, contractsRejected]) => ({
      constraint,
      signals: signals.get(constraint) ?? 0,
      contractsRejected,
    }))
    .sort((a, b) => b.contractsRejected - a.contractsRejected);
}

function profileExcursion(trades: AnalyzedTrade[]): ExcursionProfile {
  const withMfe = trades.filter((trade) => trade.mfePremium != null);
  return {
    trades: trades.length,
    medianCaptureEfficiency: median(
      trades
        .map((trade) => trade.captureEfficiency)
        .filter((value): value is number => value != null),
    ),
    medianHoldMs: median(trades.map((trade) => trade.holdMs)),
    medianTimeToMfeMs: median(
      trades
        .map((trade) => trade.timeToMfeMs)
        .filter((value): value is number => value != null),
    ),
    neverProfitable: withMfe.filter(
      (trade) => (trade.mfePremium as number) <= trade.entryPrice,
    ).length,
    gaveBackAWinner: withMfe.filter(
      (trade) =>
        (trade.mfePremium as number) > trade.entryPrice && trade.netPnl < 0,
    ).length,
    blindTrades: trades.filter((trade) => trade.sampleCount === 0).length,
  };
}

function bucketByTimeOfDay(trades: AnalyzedTrade[]): TimeBucket[] {
  const buckets = new Map<string, AnalyzedTrade[]>();
  for (const trade of trades) {
    const bucket = etHalfHourBucket(trade.openedAt);
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), trade]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([etBucket, group]) => {
      const wins = group.filter((trade) => trade.netPnl > 0).length;
      return {
        etBucket,
        trades: group.length,
        wins,
        netPnl: round2(group.reduce((sum, trade) => sum + trade.netPnl, 0)),
        winRate: rate(wins, group.length),
      };
    });
}

/**
 * Shape of each day's tape, so a losing session can be read against the market
 * it happened in. A breakout rule losing on a chop day and losing on a trend
 * day mean very different things.
 */
function describeSessions(sessions: DossierSession[]): SessionContext[] {
  return [...sessions]
    .sort((a, b) => a.etDateKey.localeCompare(b.etDateKey))
    .map((session) => {
      const bars = (session.bars ?? []).filter((bar) => isRegularHours(bar[0]));
      if (!bars.length) {
        return {
          etDateKey: session.etDateKey,
          open: null,
          close: null,
          high: null,
          low: null,
          rangePoints: null,
          driftPoints: null,
          meanAbsBarMove: null,
          barCount: 0,
          fullSession: session.fullSession,
        };
      }
      const open = bars[0][1];
      const close = bars[bars.length - 1][4];
      const high = Math.max(...bars.map((bar) => bar[2]));
      const low = Math.min(...bars.map((bar) => bar[3]));
      const moves = bars
        .slice(1)
        .map((bar, index) => Math.abs(bar[4] - bars[index][4]));
      return {
        etDateKey: session.etDateKey,
        open: round2(open),
        close: round2(close),
        high: round2(high),
        low: round2(low),
        rangePoints: round2(high - low),
        driftPoints: round2(close - open),
        meanAbsBarMove: moves.length
          ? round2(moves.reduce((sum, move) => sum + move, 0) / moves.length)
          : null,
        barCount: bars.length,
        fullSession: session.fullSession,
      };
    });
}

/**
 * Group trades by the settings fingerprint in force when they closed, so a
 * change in results can be lined up against a change in configuration rather
 * than assumed to be strategy drift.
 */
function windowByConfig(
  trades: Array<AnalyzedTrade & { configVersion: string | null }>,
): ConfigWindow[] {
  const byVersion = new Map<string, Array<AnalyzedTrade>>();
  for (const trade of trades) {
    const key = trade.configVersion ?? 'UNVERSIONED';
    byVersion.set(key, [...(byVersion.get(key) ?? []), trade]);
  }
  return [...byVersion.entries()]
    .map(([configVersion, group]) => {
      const days = group.map((trade) => trade.etDateKey).sort();
      return {
        configVersion,
        firstTradeEt: days[0],
        lastTradeEt: days[days.length - 1],
        trades: group.length,
        netPnl: round2(group.reduce((sum, trade) => sum + trade.netPnl, 0)),
      };
    })
    .sort((a, b) => a.firstTradeEt.localeCompare(b.firstTradeEt));
}

/**
 * Statements about the shape of the evidence that a reader could otherwise
 * get wrong. These are limits, not conclusions — the agent draws those.
 */
function buildNotes(params: {
  trades: AnalyzedTrade[];
  sessions: SessionContext[];
  excursion: ExcursionProfile;
  skips: SkipCount[];
}): string[] {
  const notes: string[] = [];

  if (params.excursion.blindTrades > 0) {
    notes.push(
      `${params.excursion.blindTrades} trade(s) recorded no usable bid, so their ` +
        'premium stop was never evaluable and any exit replay over them is guesswork.',
    );
  }

  const partial = params.sessions.filter((session) => !session.fullSession);
  if (partial.length) {
    notes.push(
      `Partial bar coverage on ${partial
        .map((session) => session.etDateKey)
        .join(', ')} — an early close or a failed backfill, not a quiet market.`,
    );
  }

  const alreadyInPosition = params.skips.find(
    (skip) => skip.reason === 'ALREADY_IN_POSITION',
  );
  if (alreadyInPosition) {
    notes.push(
      `${alreadyInPosition.count} setup(s) were refused because a position was ` +
        'already open. The bot holds one position at a time, so this counts ' +
        'opportunity lost to position sizing, not to the entry rule.',
    );
  }

  if (params.trades.length < 30) {
    notes.push(
      `${params.trades.length} strategy trades is below the 30 needed for exit-policy ` +
        'statistics. Directional reads are still fair; per-trade estimates are not.',
    );
  }

  return notes;
}

export function buildWeeklyDossier(params: {
  weekEndingEt: string;
  trades: Array<AnalyzedTrade & { configVersion: string | null }>;
  events: DossierEvent[];
  sessions: DossierSession[];
  tapeByTradeKey?: Map<string, TapeSample[]>;
  now?: number;
}): WeeklyDossier {
  const { trades, events } = params;

  const signals = events.filter((event) => event.type === 'SIGNAL').length;
  const entrySubmits = events.filter(
    (event) => event.type === 'ENTRY_SUBMIT',
  ).length;
  const entryFills = events.filter(
    (event) => event.type === 'ENTRY_FILL',
  ).length;

  const skipCensus = censusSkips(events);
  const excursion = profileExcursion(trades);
  const sessionContext = describeSessions(params.sessions);

  return {
    weekEndingEt: params.weekEndingEt,
    generatedAt: params.now ?? Date.now(),
    sessions: summarizeSessions(trades),
    strategyPerformance: splitByStrategy(trades),
    signalFunnel: {
      signals,
      entrySubmits,
      entryFills,
      fillRate: rate(entryFills, signals),
    },
    skipCensus,
    contractMisses: summarizeContractMisses(events),
    excursion,
    timeOfDay: bucketByTimeOfDay(trades),
    sessionContext,
    configWindows: windowByConfig(trades),
    rapidScalpReplay: scoreRapidScalpReplay({
      trades,
      tapeByTradeKey: params.tapeByTradeKey ?? new Map(),
    }),
    notes: buildNotes({
      trades,
      sessions: sessionContext,
      excursion,
      skips: skipCensus,
    }),
  };
}
