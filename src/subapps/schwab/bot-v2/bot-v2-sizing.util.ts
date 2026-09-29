import { computeBudget, sizePosition } from '@schwab/bot/bot-strike-selection.util';

/** One SPY/SPXW option tick. A tighter stop is not a real risk distance. */
export const OPTION_PREMIUM_TICK = 0.01;

export type SizeReason = 'OK' | 'STOP_TOO_TIGHT' | 'NO_STOP' | 'NO_BUDGET';

export interface SizeAtRiskInput {
  useRiskAtStop: boolean;
  maxRiskUsd: number;
  ask: number;
  /** Provisional premium stop computed before the order. */
  stopPremium: number | null;
  settledCash: number;
  equity: number;
  riskPct: number;
}

export interface SizeAtRiskResult {
  qty: number;
  reason: SizeReason;
}

/**
 * Contract count for a V2 entry.
 *
 * Flag off: the champion budget, `min(settledCash, equity * riskPct/100)`
 * divided by premium notional. Flag on: dollars risked to the premium stop,
 * still capped by cash that can pay for the contracts.
 */
export function sizeAtRisk(input: SizeAtRiskInput): SizeAtRiskResult {
  if (!(input.ask > 0) || !(input.settledCash > 0)) {
    return { qty: 0, reason: 'NO_BUDGET' };
  }

  if (!input.useRiskAtStop) {
    const qty = sizePosition(
      computeBudget(input.settledCash, input.equity, input.riskPct),
      input.ask,
    );
    return { qty, reason: qty > 0 ? 'OK' : 'NO_BUDGET' };
  }

  if (input.stopPremium == null || !Number.isFinite(input.stopPremium)) {
    return { qty: 0, reason: 'NO_STOP' };
  }

  const distance = input.ask - input.stopPremium;
  if (!(distance >= OPTION_PREMIUM_TICK)) {
    return { qty: 0, reason: 'STOP_TOO_TIGHT' };
  }

  if (!(input.maxRiskUsd > 0)) {
    return { qty: 0, reason: 'NO_BUDGET' };
  }

  const riskQty = Math.floor(input.maxRiskUsd / (distance * 100));
  const cashQty = Math.floor(input.settledCash / (input.ask * 100));
  const qty = Math.min(riskQty, cashQty);
  return { qty, reason: qty > 0 ? 'OK' : 'NO_BUDGET' };
}
