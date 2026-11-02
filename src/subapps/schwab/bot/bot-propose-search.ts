import { BacktestConfig } from './bot-backtest.util';
import { capSettingsPatch, ProposeSettings } from './bot-propose.util';
import { ProfitLockLadder } from '../bot-v2/bot-v2-profit-lock.util';
import { BotStrategy } from './enums/strategy.enum';

/** Sessions kept for the search. Older than this, the dyno does not look. */
export const SEARCH_LOOKBACK_DAYS = 40;
export const SEARCH_MAX_SESSIONS = 15;
export const SEARCH_HOLDOUT_SESSIONS = 2;

const WINDOW_ENDS = ['11:00', '12:00', '13:00'] as const;
const COOLDOWNS = [5, 15] as const;

const LADDER_FIELDS: Array<{
  key: keyof ProposeSettings;
  lock: keyof ProfitLockLadder;
}> = [
  { key: 'lossCutPct', lock: 'stopPct' },
  { key: 'protectArmPct', lock: 'armPct' },
  { key: 'protectFloorPct', lock: 'floorPct' },
  { key: 'givebackPct', lock: 'givebackPct' },
  { key: 'tightFromPct', lock: 'tightFromPct' },
  { key: 'tightGivebackPct', lock: 'tightGivebackPct' },
];

const BRIEF = 'bot-reports/research-brief.md';

export interface BookScore {
  trades: number;
  net: number;
  greenDays: number;
  fees: number;
}

export interface TradeLite {
  etDateKey: string;
  netPnl: number;
  fees: number;
}

export interface SearchCandidate {
  id: string;
  kind:
    | 'book'
    | 'rule-off'
    | 'rule-alone'
    | 'window'
    | 'cooldown'
    | 'ladder'
    | 'quiet-days';
  label: string;
  source: string;
  strategies?: string[];
  tradeWindowEnd?: string;
  cooldownMins?: number;
  profitLock?: Partial<ProfitLockLadder>;
  /** Settings the 09:20 job can write. Quiet-day has none until a gate exists. */
  patch: SearchPatch;
}

export interface SearchPatch {
  strategiesEnabled?: string[];
  tradeWindowEnd?: string;
  cooldownMins?: number;
  lossCutPct?: number;
  protectArmPct?: number;
  protectFloorPct?: number;
  givebackPct?: number;
  tightFromPct?: number;
  tightGivebackPct?: number;
}

export interface SearchWinner {
  id: string;
  kind: SearchCandidate['kind'];
  label: string;
  source: string;
  search: BookScore;
  holdout: BookScore;
  patch: SearchPatch;
  /** First-hour range, in index points, learned on the search sessions only. */
  quietCutoffPts?: number;
}

export interface ShouldHave {
  etDateKey: string;
  window: 'search' | 'holdout';
  rule: string;
  bookNet: number;
  ruleNet: number;
}

export interface ScoredCandidate {
  id: string;
  kind: SearchCandidate['kind'];
  label: string;
  source: string;
  search: BookScore;
  holdout: BookScore;
  cleared: boolean;
}

export interface SearchSummary {
  tooFewSessions: boolean;
  searchSessions: string[];
  holdoutSessions: string[];
  book: { search: BookScore; holdout: BookScore };
  rules: Array<{ rule: string; search: BookScore; holdout: BookScore }>;
  shouldHave: ShouldHave[];
  dropCandidates: string[];
  quietCutoffPts: number | null;
  winner: SearchWinner | null;
  ran: ScoredCandidate[];
}

export interface TrainerBookInput {
  strategiesEnabled: string[];
  combineMode: 'ANY' | 'CONFIRMING';
  minStrategyAgreement: number;
  callsEnabled: boolean;
  putsEnabled: boolean;
  deltaMin: number;
  deltaMax: number;
  minPremium: number;
  maxPremium: number;
  maxSpreadPct: number;
  atrPeriod: number;
  cooldownMins: number;
  tradeWindowStart: string;
  tradeWindowEnd: string;
  hardFlattenTime: string;
  riskPct: number;
  useRiskAtStop: boolean;
  maxRiskUsd: number;
  paperSlippageCents: number;
  signalBarSeconds: number;
  useScaleOut: boolean;
  useTimeStop: boolean;
  timeStopSeconds: number;
  botUnderlying: string;
  lossCutPct: number;
  protectArmPct: number;
  protectFloorPct: number;
  givebackPct: number;
  tightFromPct: number;
  tightGivebackPct: number;
}

const EMPTY_SCORE: BookScore = { trades: 0, net: 0, greenDays: 0, fees: 0 };

export function configFromTrainer(row: TrainerBookInput): BacktestConfig {
  const directions: Array<'CALL' | 'PUT'> = [];
  if (row.callsEnabled) directions.push('CALL');
  if (row.putsEnabled) directions.push('PUT');
  const underlying = row.botUnderlying === 'SPY' ? 'SPY' : 'SPXW';
  const signalBarSeconds = row.signalBarSeconds === 60 ? 60 : 15;
  return {
    strategies: [...row.strategiesEnabled] as BacktestConfig['strategies'],
    combineMode: row.combineMode === 'CONFIRMING' ? 'CONFIRMING' : 'ANY',
    minStrategyAgreement:
      row.minStrategyAgreement > 1 ? row.minStrategyAgreement : 1,
    directionsEnabled: directions.length ? directions : ['CALL', 'PUT'],
    filters: {
      deltaMin: Number(row.deltaMin),
      deltaMax: Number(row.deltaMax),
      minPremium: Number(row.minPremium),
      maxPremium: Number(row.maxPremium),
      maxSpreadPct: Number(row.maxSpreadPct),
    },
    atrPeriod: Number(row.atrPeriod) || 14,
    cooldownMins: Number(row.cooldownMins),
    tradeWindowStart: row.tradeWindowStart,
    tradeWindowEnd: row.tradeWindowEnd,
    hardFlattenTime: row.hardFlattenTime,
    usePremiumStop: true,
    premiumStopPct: 25,
    usePremiumTarget: true,
    premiumTargetPct: 40,
    useTrailStop: true,
    trailArmPct: 10,
    trailPct: 15,
    trailMinLockPct: 5,
    stopAtrMult: 1.5,
    targetAtrMult: 2.5,
    riskPct: Number(row.riskPct) || 10,
    equity: 10_000,
    underlying,
    signalBarSeconds,
    profitLock: {
      stopPct: Number(row.lossCutPct),
      armPct: Number(row.protectArmPct),
      floorPct: Number(row.protectFloorPct),
      givebackPct: Number(row.givebackPct),
      tightFromPct: Number(row.tightFromPct),
      tightGivebackPct: Number(row.tightGivebackPct),
    },
    useTimeStop: row.useTimeStop,
    timeStopSeconds: Number(row.timeStopSeconds) || 180,
    useScaleOut: row.useScaleOut,
    paperSlippageCents: Number(row.paperSlippageCents) || 0,
    useRiskAtStop: row.useRiskAtStop,
    maxRiskUsd: Number(row.maxRiskUsd) || 800,
    settledCash: 10_000,
    trendGate: true,
    maxBars: 500,
  };
}

export function buildCandidates(input: {
  rules: string[];
  cooldownMins: number;
  tradeWindowEnd: string;
  ladder: ProposeSettings;
}): SearchCandidate[] {
  const rules = input.rules.filter((rule) => rule.trim().length > 0);
  const book: SearchCandidate = {
    id: 'book',
    kind: 'book',
    label: 'Current book',
    source: 'trainer settings',
    patch: {},
  };
  const off = (rules.length > 1 ? rules : []).map((rule) => ({
    id: `off:${rule}`,
    kind: 'rule-off' as const,
    label: `${rule} off`,
    source: 'trainer settings',
    strategies: rules.filter((other) => other !== rule),
    patch: { strategiesEnabled: rules.filter((other) => other !== rule) },
  }));
  const alone = rules.map((rule) => ({
    id: `alone:${rule}`,
    kind: 'rule-alone' as const,
    label: `${rule} alone`,
    source: 'trainer settings',
    strategies: [rule],
    patch: { strategiesEnabled: [rule] },
  }));
  const windows = WINDOW_ENDS.filter((end) => end !== input.tradeWindowEnd).map(
    (end) => ({
      id: `window:${end}`,
      kind: 'window' as const,
      label: `New entries stop at ${end}`,
      source: BRIEF,
      tradeWindowEnd: end,
      patch: { tradeWindowEnd: end },
    }),
  );
  const cooldowns = COOLDOWNS.filter((mins) => mins !== input.cooldownMins).map(
    (mins) => ({
      id: `cooldown:${mins}`,
      kind: 'cooldown' as const,
      label: `Cooldown ${mins} minutes`,
      source: 'trainer settings',
      cooldownMins: mins,
      patch: { cooldownMins: mins },
    }),
  );
  const ladder = ladderCandidates(input.ladder);
  const quiet: SearchCandidate = {
    id: 'quiet-days',
    kind: 'quiet-days',
    label: 'Skip the quietest third of sessions',
    source: BRIEF,
    patch: {},
  };
  return [book, ...off, ...alone, ...windows, ...cooldowns, ...ladder, quiet];
}

export function applyCandidate(
  base: BacktestConfig,
  candidate: SearchCandidate,
): BacktestConfig {
  const next: BacktestConfig = {
    ...base,
    strategies: [...base.strategies],
    filters: { ...base.filters },
    profitLock: base.profitLock ? { ...base.profitLock } : base.profitLock,
  };
  if (candidate.strategies) {
    next.strategies = [...candidate.strategies] as BacktestConfig['strategies'];
  }
  if (candidate.tradeWindowEnd) next.tradeWindowEnd = candidate.tradeWindowEnd;
  if (candidate.cooldownMins != null)
    next.cooldownMins = candidate.cooldownMins;
  if (candidate.profitLock && next.profitLock) {
    next.profitLock = { ...next.profitLock, ...candidate.profitLock };
  }
  return next;
}

/** Last `holdout` keys are the check. Earlier keys are what the search may fit. */
export function splitHoldout(
  sessionKeys: string[],
  holdout = SEARCH_HOLDOUT_SESSIONS,
): { search: string[]; holdout: string[] } {
  if (sessionKeys.length <= holdout) {
    return { search: [], holdout: [...sessionKeys] };
  }
  return {
    search: sessionKeys.slice(0, -holdout),
    holdout: sessionKeys.slice(-holdout),
  };
}

export function scoreTrades(trades: TradeLite[]): BookScore {
  const byDay = new Map<string, number>();
  let fees = 0;
  for (const trade of trades) {
    byDay.set(
      trade.etDateKey,
      (byDay.get(trade.etDateKey) ?? 0) + trade.netPnl,
    );
    fees += trade.fees;
  }
  let net = 0;
  let greenDays = 0;
  for (const value of byDay.values()) {
    net += value;
    if (value > 0) greenDays += 1;
  }
  return {
    trades: trades.length,
    net: round2(net),
    greenDays,
    fees: round2(fees),
  };
}

export function scoreWindow(
  trades: TradeLite[],
  sessions: string[],
): BookScore {
  const allowed = new Set(sessions);
  return scoreTrades(trades.filter((trade) => allowed.has(trade.etDateKey)));
}

/**
 * More money on the sessions used to choose, not fewer green days there,
 * and not a worse net on the two sessions held out.
 */
export function clearsBar(
  bookSearch: BookScore,
  bookHoldout: BookScore,
  search: BookScore,
  holdout: BookScore,
): boolean {
  return (
    search.net > bookSearch.net &&
    search.greenDays >= bookSearch.greenDays &&
    holdout.net >= bookHoldout.net
  );
}

/** High minus low of spot from 09:30 through 10:29 ET. Null when the hour is missing. */
export function firstHourRange(
  snapshots: Array<{ at: number; spot: number | null }>,
): number | null {
  const spots = snapshots
    .filter((snapshot) => {
      if (snapshot.spot == null || !(snapshot.spot > 0)) return false;
      const hhmm = etHhMm(snapshot.at);
      return hhmm >= '09:30' && hhmm < '10:30';
    })
    .map((snapshot) => snapshot.spot as number);
  if (spots.length < 2) return null;
  return round2(Math.max(...spots) - Math.min(...spots));
}

/** Cutoff for the quietest third. Learned on search-window ranges only. */
export function quietCutoff(ranges: number[]): number | null {
  const sorted = ranges
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  const count = Math.floor(sorted.length / 3);
  if (count < 1) return null;
  return sorted[count - 1];
}

export function isQuiet(range: number | null, cutoff: number | null): boolean {
  if (cutoff == null || range == null) return false;
  return range <= cutoff;
}

/**
 * A rule that lost money on the search window two Saturdays in a row, while
 * at least one other rule made money on both of those windows.
 */
export function repeatedDropRules(
  current: Array<{ rule: string; searchNet: number }>,
  prior: Array<{ rule: string; searchNet: number }> | null,
): string[] {
  if (!prior?.length) return [];
  const priorNet = new Map(prior.map((row) => [row.rule, row.searchNet]));
  const greenBoth = current.some((row) => {
    const earlier = priorNet.get(row.rule);
    return earlier != null && row.searchNet > 0 && earlier > 0;
  });
  if (!greenBoth) return [];
  return current
    .filter((row) => {
      const earlier = priorNet.get(row.rule);
      return earlier != null && row.searchNet < 0 && earlier < 0;
    })
    .map((row) => row.rule);
}

export function shouldHaveBought(input: {
  sessions: Array<{ etDateKey: string; window: 'search' | 'holdout' }>;
  bookTrades: TradeLite[];
  alone: Array<{ rule: string; trades: TradeLite[] }>;
}): ShouldHave[] {
  const notes: ShouldHave[] = [];
  for (const session of input.sessions) {
    const bookNet = round2(
      input.bookTrades
        .filter((trade) => trade.etDateKey === session.etDateKey)
        .reduce((sum, trade) => sum + trade.netPnl, 0),
    );
    if (!(bookNet < 0)) continue;
    let best: { rule: string; net: number } | null = null;
    for (const rule of input.alone) {
      const net = round2(
        rule.trades
          .filter((trade) => trade.etDateKey === session.etDateKey)
          .reduce((sum, trade) => sum + trade.netPnl, 0),
      );
      const better = net > 0 || net > bookNet;
      if (!better) continue;
      if (!best || net > best.net) best = { rule: rule.rule, net };
    }
    if (!best) continue;
    notes.push({
      etDateKey: session.etDateKey,
      window: session.window,
      rule: best.rule,
      bookNet,
      ruleNet: best.net,
    });
  }
  return notes;
}

export function summarizeReplay(input: {
  sessionKeys: string[];
  candidates: SearchCandidate[];
  tradesById: Map<string, TradeLite[]>;
  priorRules: Array<{ rule: string; searchNet: number }> | null;
  quietCutoffPts: number | null;
}): SearchSummary {
  const split = splitHoldout(input.sessionKeys);
  const tooFew =
    split.search.length < 1 || split.holdout.length < SEARCH_HOLDOUT_SESSIONS;
  const bookTrades = input.tradesById.get('book') ?? [];
  const book = {
    search: tooFew ? EMPTY_SCORE : scoreWindow(bookTrades, split.search),
    holdout: tooFew ? EMPTY_SCORE : scoreWindow(bookTrades, split.holdout),
  };
  const rules = input.candidates
    .filter((candidate) => candidate.kind === 'rule-alone')
    .map((candidate) => {
      const trades = input.tradesById.get(candidate.id) ?? [];
      return {
        rule: candidate.strategies?.[0] ?? candidate.id,
        search: tooFew ? EMPTY_SCORE : scoreWindow(trades, split.search),
        holdout: tooFew ? EMPTY_SCORE : scoreWindow(trades, split.holdout),
      };
    });
  const ran = input.candidates
    .filter((candidate) => candidate.id !== 'book')
    .map((candidate) => {
      const trades = input.tradesById.get(candidate.id) ?? [];
      const search = tooFew ? EMPTY_SCORE : scoreWindow(trades, split.search);
      const holdout = tooFew ? EMPTY_SCORE : scoreWindow(trades, split.holdout);
      return {
        id: candidate.id,
        kind: candidate.kind,
        label: candidate.label,
        source: candidate.source,
        search,
        holdout,
        cleared: tooFew
          ? false
          : clearsBar(book.search, book.holdout, search, holdout),
      };
    });
  const dropCandidates = tooFew
    ? []
    : repeatedDropRules(
        rules.map((rule) => ({ rule: rule.rule, searchNet: rule.search.net })),
        input.priorRules,
      );
  const winner = tooFew
    ? null
    : pickWinner(input.candidates, ran, input.quietCutoffPts);
  const sessions = [
    ...split.search.map((etDateKey) => ({
      etDateKey,
      window: 'search' as const,
    })),
    ...split.holdout.map((etDateKey) => ({
      etDateKey,
      window: 'holdout' as const,
    })),
  ];
  return {
    tooFewSessions: tooFew,
    searchSessions: split.search,
    holdoutSessions: split.holdout,
    book,
    rules,
    shouldHave: tooFew
      ? []
      : shouldHaveBought({
          sessions,
          bookTrades,
          alone: rules.map((rule) => ({
            rule: rule.rule,
            trades: input.tradesById.get(`alone:${rule.rule}`) ?? [],
          })),
        }),
    dropCandidates,
    quietCutoffPts: input.quietCutoffPts,
    winner,
    ran,
  };
}

function pickWinner(
  candidates: SearchCandidate[],
  ran: ScoredCandidate[],
  quietCutoffPts: number | null,
): SearchWinner | null {
  const cleared = ran.filter((row) => row.cleared);
  if (!cleared.length) return null;
  cleared.sort(
    (a, b) =>
      b.search.net - a.search.net || b.search.greenDays - a.search.greenDays,
  );
  const best = cleared[0];
  const candidate = candidates.find((row) => row.id === best.id);
  if (!candidate) return null;
  return {
    id: best.id,
    kind: best.kind,
    label: best.label,
    source: best.source,
    search: best.search,
    holdout: best.holdout,
    patch: candidate.patch,
    quietCutoffPts:
      candidate.kind === 'quiet-days' ? quietCutoffPts ?? undefined : undefined,
  };
}

function ladderCandidates(current: ProposeSettings): SearchCandidate[] {
  const found: SearchCandidate[] = [];
  for (const field of LADDER_FIELDS) {
    for (const sign of [1, -1]) {
      const proposed = current[field.key] * (1 + sign * 0.2);
      const patch = capSettingsPatch(current, { [field.key]: proposed });
      const value = patch[field.key];
      if (typeof value !== 'number') continue;
      const next: ProposeSettings = { ...current, [field.key]: value };
      if (!(next.protectFloorPct < next.protectArmPct)) continue;
      found.push({
        id: `ladder:${field.key}:${value}`,
        kind: 'ladder',
        label: `${field.key} ${current[field.key]} → ${value}`,
        source: 'trainer settings',
        profitLock: { [field.lock]: value },
        patch: { [field.key]: value },
      });
    }
  }
  return found;
}

function etHhMm(at: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(at));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const LADDER_KEYS = [
  'lossCutPct',
  'protectArmPct',
  'protectFloorPct',
  'givebackPct',
  'tightFromPct',
  'tightGivebackPct',
] as const;

const KNOWN_RULES = new Set<string>(Object.values(BotStrategy));

/**
 * Writes a winning patch onto the trainer. The six sell numbers also land on
 * the desk bot. A rule list, cooldown, or entry-window end stays on the trainer.
 * Returns false when the sell ladder would lock above its arm, and changes nothing.
 */
export function applySearchPatch(
  trainer: SearchPatch & { strategiesEnabled: string[] },
  personal: SearchPatch | null,
  patch: SearchPatch,
): boolean {
  const nextLadder = {
    lossCutPct: num(patch.lossCutPct, trainer.lossCutPct),
    protectArmPct: num(patch.protectArmPct, trainer.protectArmPct),
    protectFloorPct: num(patch.protectFloorPct, trainer.protectFloorPct),
    givebackPct: num(patch.givebackPct, trainer.givebackPct),
    tightFromPct: num(patch.tightFromPct, trainer.tightFromPct),
    tightGivebackPct: num(patch.tightGivebackPct, trainer.tightGivebackPct),
  };
  if (!(nextLadder.protectFloorPct < nextLadder.protectArmPct)) return false;

  for (const key of LADDER_KEYS) {
    if (typeof patch[key] !== 'number' || !Number.isFinite(patch[key]))
      continue;
    trainer[key] = patch[key];
    if (personal) personal[key] = patch[key];
  }
  if (
    Array.isArray(patch.strategiesEnabled) &&
    patch.strategiesEnabled.length > 0 &&
    patch.strategiesEnabled.every((rule) => KNOWN_RULES.has(rule))
  ) {
    trainer.strategiesEnabled = [...patch.strategiesEnabled];
  }
  if (
    typeof patch.cooldownMins === 'number' &&
    Number.isInteger(patch.cooldownMins) &&
    patch.cooldownMins >= 1 &&
    patch.cooldownMins <= 30
  ) {
    trainer.cooldownMins = patch.cooldownMins;
  }
  if (
    patch.tradeWindowEnd === '11:00' ||
    patch.tradeWindowEnd === '12:00' ||
    patch.tradeWindowEnd === '13:00'
  ) {
    trainer.tradeWindowEnd = patch.tradeWindowEnd;
  }
  return true;
}

function num(value: number | undefined, fallback: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : Number(fallback);
}
