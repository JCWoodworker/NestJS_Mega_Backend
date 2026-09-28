import {
  AnalyzedTrade,
  assessReadiness,
  ExitPolicy,
  ReadinessLevel,
  scorePolicies,
} from './bot-analysis.util';
import { TapeSample } from './bot-trade-metrics.util';

/** Infrastructure flattens. Kept in daily totals, dropped from propose. */
export const NON_STRATEGY_EXIT_REASONS = new Set(['SOCKET_LOSS']);

export const PROPOSE_HOLDOUT_SESSIONS = 2;
export const PROPOSE_BOOTSTRAP_SAMPLES = 1000;
export const PROPOSE_STABILITY_SESSIONS = 5;
export const PROPOSE_STABILITY_MIN = 3;
export const PROPOSE_MAX_KEYS = 2;
export const PROPOSE_STEP_FRACTION = 0.2;

const SETTING_BOUNDS: Record<string, { min: number; max: number }> = {
  premiumTargetPct: { min: 1, max: 500 },
  premiumStopPct: { min: 1, max: 90 },
  trailPct: { min: 1, max: 90 },
  trailArmPct: { min: 5, max: 200 },
};

export interface ProposeSettings {
  premiumTargetPct: number;
  premiumStopPct: number;
  trailPct: number;
  trailArmPct: number;
}

export interface EvidencePacket {
  weekEndingEt: string;
  readinessPropose: ReadinessLevel;
  strategyTradeCount: number;
  opsTradeCount: number;
  actionable: boolean;
  blockedReasons: string[];
  patch: Record<string, number>;
  holdoutDeltaPerTrade: number | null;
  bootstrapLowerBound: number | null;
  stableSessions: number;
  changeType: 'config';
  allowedPaths: string[];
  sessionSummaries: Array<{ etDateKey: string; trades: number; netPnl: number }>;
  opsExits: Array<{ etDateKey: string; reason: string; trades: number; netPnl: number }>;
}

export function strategyTrades(trades: AnalyzedTrade[]): AnalyzedTrade[] {
  return trades.filter(
    (trade) => !NON_STRATEGY_EXIT_REASONS.has(trade.exitReason ?? ''),
  );
}

export function opsTrades(trades: AnalyzedTrade[]): AnalyzedTrade[] {
  return trades.filter((trade) =>
    NON_STRATEGY_EXIT_REASONS.has(trade.exitReason ?? ''),
  );
}

/** 5th percentile of the resampled mean. Deterministic for tests. */
export function bootstrapLowerBound(
  deltas: number[],
  samples = PROPOSE_BOOTSTRAP_SAMPLES,
  seed = 1,
): number | null {
  if (!deltas.length) return null;
  let state = seed >>> 0;
  const next = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const means: number[] = [];
  for (let i = 0; i < samples; i += 1) {
    let sum = 0;
    for (let j = 0; j < deltas.length; j += 1) {
      sum += deltas[Math.floor(next() * deltas.length)];
    }
    means.push(sum / deltas.length);
  }
  means.sort((a, b) => a - b);
  return means[Math.floor(means.length * 0.05)];
}

export function countStableSessions(signatures: Array<string | null>): number {
  const counts = new Map<string, number>();
  for (const signature of signatures) {
    if (!signature) continue;
    counts.set(signature, (counts.get(signature) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

function policySignature(policy: ExitPolicy): string {
  return [
    `stop=${policy.stopPct ?? '-'}`,
    `target=${policy.targetPct ?? '-'}`,
    `trail=${policy.trailPct ?? '-'}`,
    `arm=${policy.trailArmPct ?? '-'}`,
    `time=${policy.timeStopMs ?? '-'}`,
  ].join('|');
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function capStep(current: number, proposed: number, min: number, max: number): number {
  const room = Math.abs(current) * PROPOSE_STEP_FRACTION;
  const stepped = Math.min(current + room, Math.max(current - room, proposed));
  const bounded = Math.min(max, Math.max(min, stepped));
  return round2(bounded);
}

/** At most two settings keys, each moved at most 20% and inside DTO bounds. */
export function capSettingsPatch(
  current: ProposeSettings,
  proposed: Partial<ProposeSettings>,
): Record<string, number> {
  const entries = Object.entries(proposed).flatMap(([key, value]) => {
    if (value == null || !(key in current)) return [];
    const bounds = SETTING_BOUNDS[key];
    const currentValue = current[key as keyof ProposeSettings];
    const next = capStep(currentValue, value, bounds.min, bounds.max);
    if (Math.abs(next - currentValue) < 0.05) return [];
    return [[key, next] as const];
  });
  entries.sort(
    (a, b) =>
      Math.abs(b[1] - current[b[0] as keyof ProposeSettings]) -
      Math.abs(a[1] - current[a[0] as keyof ProposeSettings]),
  );
  return Object.fromEntries(entries.slice(0, PROPOSE_MAX_KEYS));
}

function policyToPercents(policy: ExitPolicy): Partial<ProposeSettings> {
  const patch: Partial<ProposeSettings> = {};
  if (policy.targetPct != null) patch.premiumTargetPct = policy.targetPct * 100;
  if (policy.stopPct != null) patch.premiumStopPct = policy.stopPct * 100;
  if (policy.trailPct != null) patch.trailPct = policy.trailPct * 100;
  if (policy.trailArmPct != null) patch.trailArmPct = policy.trailArmPct * 100;
  return patch;
}

function groupByDay(trades: AnalyzedTrade[]): Map<string, AnalyzedTrade[]> {
  const byDay = new Map<string, AnalyzedTrade[]>();
  for (const trade of trades) {
    const day = byDay.get(trade.etDateKey) ?? [];
    day.push(trade);
    byDay.set(trade.etDateKey, day);
  }
  return byDay;
}

function holdoutDeltas(params: {
  trades: AnalyzedTrade[];
  tapeByTradeKey: Map<string, TapeSample[]>;
  policy: ExitPolicy;
}): number[] {
  const scored = scorePolicies({
    trades: params.trades,
    tapeByTradeKey: params.tapeByTradeKey,
    policies: [params.policy],
  })[0];
  if (!scored || scored.trades === 0) return [];
  // scorePolicies only returns the aggregate. Rebuild per-trade deltas by
  // calling it one trade at a time so the bootstrap sees the distribution.
  return params.trades.flatMap((trade) => {
    const one = scorePolicies({
      trades: [trade],
      tapeByTradeKey: params.tapeByTradeKey,
      policies: [params.policy],
    })[0];
    if (!one || one.trades === 0) return [];
    return [one.deltaVsActual];
  });
}

/**
 * Replay the week's strategy trades under the existing exit grid.
 * A red week is the input. `actionable` is true only when a capped settings
 * patch still helps on the held-out sessions.
 */
export function buildEvidencePacket(params: {
  trades: AnalyzedTrade[];
  tapeByTradeKey: Map<string, TapeSample[]>;
  policies: ExitPolicy[];
  current: ProposeSettings;
  weekEndingEt: string;
}): EvidencePacket {
  const strategy = strategyTrades(params.trades);
  const ops = opsTrades(params.trades);
  const readiness = assessReadiness(strategy.length);
  const byDay = groupByDay(strategy);
  const days = [...byDay.keys()].sort();
  const blocked: string[] = [];

  const sessionSummaries = days.map((etDateKey) => {
    const day = byDay.get(etDateKey) ?? [];
    return {
      etDateKey,
      trades: day.length,
      netPnl: round2(day.reduce((sum, trade) => sum + trade.netPnl, 0)),
    };
  });
  const opsByDay = groupByDay(ops);
  const opsExits = [...opsByDay.entries()].flatMap(([etDateKey, day]) => {
    const byReason = new Map<string, AnalyzedTrade[]>();
    for (const trade of day) {
      const reason = trade.exitReason ?? 'UNKNOWN';
      byReason.set(reason, [...(byReason.get(reason) ?? []), trade]);
    }
    return [...byReason.entries()].map(([reason, group]) => ({
      etDateKey,
      reason,
      trades: group.length,
      netPnl: round2(group.reduce((sum, trade) => sum + trade.netPnl, 0)),
    }));
  });

  const empty: EvidencePacket = {
    weekEndingEt: params.weekEndingEt,
    readinessPropose: readiness.level,
    strategyTradeCount: strategy.length,
    opsTradeCount: ops.length,
    actionable: false,
    blockedReasons: blocked,
    patch: {},
    holdoutDeltaPerTrade: null,
    bootstrapLowerBound: null,
    stableSessions: 0,
    changeType: 'config',
    allowedPaths: [],
    sessionSummaries,
    opsExits,
  };

  if (strategy.length < 30) blocked.push('INSUFFICIENT_SAMPLE');
  if (days.length < PROPOSE_HOLDOUT_SESSIONS + 1) {
    blocked.push('INSUFFICIENT_SESSIONS');
  }
  if (blocked.length) return { ...empty, blockedReasons: blocked };

  const holdoutDays = days.slice(-PROPOSE_HOLDOUT_SESSIONS);
  const trainDays = days.slice(0, -PROPOSE_HOLDOUT_SESSIONS);
  const train = trainDays.flatMap((day) => byDay.get(day) ?? []);
  const holdout = holdoutDays.flatMap((day) => byDay.get(day) ?? []);
  const ranked = scorePolicies({
    trades: train,
    tapeByTradeKey: params.tapeByTradeKey,
    policies: params.policies,
  });
  const best = ranked.find((result) => result.trades > 0 && result.deltaVsActual > 0);
  if (!best) {
    blocked.push('NO_TRAIN_IMPROVEMENT');
    return { ...empty, blockedReasons: blocked };
  }

  const deltas = holdoutDeltas({
    trades: holdout,
    tapeByTradeKey: params.tapeByTradeKey,
    policy: best.policy,
  });
  const holdoutDeltaPerTrade = deltas.length
    ? round2(deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length)
    : null;
  const bootstrapLower = bootstrapLowerBound(deltas);
  if (holdoutDeltaPerTrade == null || holdoutDeltaPerTrade <= 0) {
    blocked.push('NO_HOLDOUT_IMPROVEMENT');
  }
  if (bootstrapLower == null || bootstrapLower <= 0) blocked.push('BOOTSTRAP_FAIL');

  const recent = days.slice(-PROPOSE_STABILITY_SESSIONS);
  const signatures = recent.map((day) => {
    const dayRanked = scorePolicies({
      trades: byDay.get(day) ?? [],
      tapeByTradeKey: params.tapeByTradeKey,
      policies: params.policies,
    });
    const winner = dayRanked.find(
      (result) => result.trades > 0 && result.deltaVsActual > 0,
    );
    return winner ? policySignature(winner.policy) : null;
  });
  const stableSessions = countStableSessions(signatures);
  if (stableSessions < PROPOSE_STABILITY_MIN) blocked.push('UNSTABLE_WEEK');

  const patch = capSettingsPatch(params.current, policyToPercents(best.policy));
  if (!Object.keys(patch).length) blocked.push('STEP_CAP');

  const actionable = blocked.length === 0;
  return {
    ...empty,
    actionable,
    blockedReasons: blocked,
    patch,
    holdoutDeltaPerTrade,
    bootstrapLowerBound:
      bootstrapLower == null ? null : round2(bootstrapLower),
    stableSessions,
    allowedPaths: actionable ? ['bot-reports/'] : [],
  };
}
