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

/**
 * Pick a 0DTE contract in the delta band. When multiple candidates fit,
 * nudge toward OTM (calls: higher strike / lower |delta|; puts: lower strike /
 * lower |delta|).
 */
export function selectContract(
  chain: OptionChainQuote[],
  direction: SignalDirection,
  filters: StrikeFilters,
): OptionChainQuote | null {
  const rightFilter = direction === 'CALL' ? isCall : isPut;
  const candidates = chain.filter((q) => {
    if (!rightFilter(q.symbol)) return false;
    if (q.delta == null) return false;
    const absDelta = Math.abs(q.delta);
    if (absDelta < filters.deltaMin || absDelta > filters.deltaMax)
      return false;
    const m = mid(q);
    if (m == null || m < filters.minPremium || m > filters.maxPremium) {
      return false;
    }
    const sp = spreadPct(q);
    if (sp == null || sp > filters.maxSpreadPct) return false;
    return true;
  });

  if (!candidates.length) return null;

  // Prefer closer-to-OTM within band: smaller |delta|.
  candidates.sort((a, b) => Math.abs(a.delta ?? 1) - Math.abs(b.delta ?? 1));
  return candidates[0];
}
