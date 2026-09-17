import { OptionChainQuote } from '@schwab/market-data/option-chain.mapper';

import { SignalDirection } from './bot-strategy.util';

export interface StrikeFilters {
  deltaMin: number;
  deltaMax: number;
  minPremium: number;
  maxPremium: number;
  maxSpreadPct: number;
}

export function computeBudget(
  settledCash: number,
  equity: number,
  riskPct: number,
): number {
  return Math.min(settledCash, equity * (riskPct / 100));
}

/** Qty fitting budget; 0 means SKIP_BUDGET. Premium is per-share; contracts ×100. */
export function sizePosition(budget: number, contractPremium: number): number {
  if (contractPremium <= 0 || budget <= 0) return 0;
  return Math.floor(budget / (contractPremium * 100));
}

function mid(q: OptionChainQuote): number | null {
  if (q.bid != null && q.ask != null) return (q.bid + q.ask) / 2;
  return q.last ?? q.ask ?? q.bid ?? null;
}

function spreadPct(q: OptionChainQuote): number | null {
  if (q.bid == null || q.ask == null || q.ask <= 0) return null;
  return ((q.ask - q.bid) / q.ask) * 100;
}

function isCall(symbol: string): boolean {
  return /[0-9]{6}C[0-9]{8}/.test(symbol.replace(/\s+/g, ''));
}

function isPut(symbol: string): boolean {
  return /[0-9]{6}P[0-9]{8}/.test(symbol.replace(/\s+/g, ''));
}

/** Why a scan found nothing — `NO_CONTRACT_MATCH` is otherwise unactionable
 * for an operator, since tight delta/premium/spread bands look identical to a
 * broken bot from the desk. */
export interface StrikeSelectionDiagnostics {
  chainSize: number;
  /** Quotes on the requested side (CALL vs PUT) before any filter. */
  rightMatches: number;
  rejects: {
    delta: number;
    premium: number;
    spread: number;
    /** Missing delta or unusable bid/ask — cannot be judged against filters. */
    noQuote: number;
  };
  /** Nearest miss: fewest failed filters, then closest to the delta band. */
  best: {
    symbol: string;
    delta: number | null;
    mid: number | null;
    spreadPct: number | null;
  } | null;
}

export interface StrikeSelectionResult {
  contract: OptionChainQuote | null;
  diagnostics: StrikeSelectionDiagnostics;
}

/**
 * Pick a 0DTE contract in the delta band. When multiple candidates fit,
 * nudge toward OTM (calls: higher strike / lower |delta|; puts: lower strike /
 * lower |delta|). Also reports why rejected candidates failed.
 */
export function selectContractDetailed(
  chain: OptionChainQuote[],
  direction: SignalDirection,
  filters: StrikeFilters,
): StrikeSelectionResult {
  const rightFilter = direction === 'CALL' ? isCall : isPut;
  const rightSide = chain.filter((q) => rightFilter(q.symbol));
  const rejects = { delta: 0, premium: 0, spread: 0, noQuote: 0 };
  const bandCentre = (filters.deltaMin + filters.deltaMax) / 2;
  const candidates: OptionChainQuote[] = [];
  let best: StrikeSelectionDiagnostics['best'] = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const q of rightSide) {
    const absDelta = q.delta == null ? null : Math.abs(q.delta);
    const m = mid(q);
    const sp = spreadPct(q);

    const noQuote = absDelta == null || m == null || sp == null;
    const deltaMiss =
      absDelta != null &&
      (absDelta < filters.deltaMin || absDelta > filters.deltaMax);
    const premiumMiss =
      m != null && (m < filters.minPremium || m > filters.maxPremium);
    const spreadMiss = sp != null && sp > filters.maxSpreadPct;

    if (noQuote) rejects.noQuote += 1;
    if (deltaMiss) rejects.delta += 1;
    if (premiumMiss) rejects.premium += 1;
    if (spreadMiss) rejects.spread += 1;

    if (!noQuote && !deltaMiss && !premiumMiss && !spreadMiss) {
      candidates.push(q);
      continue;
    }

    const failures =
      Number(noQuote) +
      Number(deltaMiss) +
      Number(premiumMiss) +
      Number(spreadMiss);
    const distance = absDelta == null ? 1 : Math.abs(absDelta - bandCentre);
    const score = failures * 10 + distance;
    if (score < bestScore) {
      bestScore = score;
      best = {
        symbol: q.symbol,
        delta: q.delta ?? null,
        mid: m,
        spreadPct: sp,
      };
    }
  }

  // Prefer closer-to-OTM within band: smaller |delta|.
  candidates.sort((a, b) => Math.abs(a.delta ?? 1) - Math.abs(b.delta ?? 1));

  return {
    contract: candidates[0] ?? null,
    diagnostics: {
      chainSize: chain.length,
      rightMatches: rightSide.length,
      rejects,
      best,
    },
  };
}

export function selectContract(
  chain: OptionChainQuote[],
  direction: SignalDirection,
  filters: StrikeFilters,
): OptionChainQuote | null {
  return selectContractDetailed(chain, direction, filters).contract;
}
