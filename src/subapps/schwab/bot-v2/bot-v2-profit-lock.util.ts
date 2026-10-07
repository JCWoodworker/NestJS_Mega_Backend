import { RatchetStopResult } from '@schwab/bot/bot-exit.util';

/**
 * Trainer exit ladder, in return-on-cost percent (bid vs fill, less the
 * round-trip commission), the same number the desk's money meter shows.
 *
 * Built from the trainer's own bid tape (2026-10-06, 37 one-lot SPXW trades):
 * winners peaked at a median +16.7% and only 1 of 18 ever dipped below −12%;
 * losers peaked at a median +1.1% and 14 of 19 went below −12%. The −12%
 * stop is where those two populations separate. Nothing locks until +8%
 * because the spread opens every trade about −2% red and noise lives below
 * that line. Above +8% the stop only moves up.
 */
export const TRAINER_STOP_PCT = 12;
export const TRAINER_ARM_PCT = 8;
export const TRAINER_FLOOR_PCT = 2;
export const TRAINER_GIVEBACK_PCT = 6;
export const TRAINER_TIGHT_FROM_PCT = 20;
export const TRAINER_TIGHT_GIVEBACK_PCT = 4;

export interface ProfitLockInput {
  entryPremium: number;
  optionBid: number;
  peakBid: number | null;
  stopPremium: number | null;
  quantity: number;
  /** Dollars for the whole position, both legs. */
  commissionRoundTrip: number;
}

/** Net unrealized dollars as a percent of what the position cost. */
export function returnOnCostPct(
  bid: number,
  entryPremium: number,
  quantity: number,
  commissionRoundTrip: number,
): number {
  const qty = Math.max(quantity, 1);
  const cost = entryPremium * 100 * qty;
  if (cost <= 0) return 0;
  const unrealized = (bid - entryPremium) * 100 * qty - commissionRoundTrip;
  return (unrealized / cost) * 100;
}

/** Bid at which the position nets `returnPct` of its cost after commission. */
export function bidForReturnPct(
  returnPct: number,
  entryPremium: number,
  quantity: number,
  commissionRoundTrip: number,
): number {
  const qty = Math.max(quantity, 1);
  return entryPremium * (1 + returnPct / 100) + commissionRoundTrip / (100 * qty);
}

/** Return percent the stop should guarantee for a given peak return, or null below the arm. */
export function lockedReturnFor(peakReturnPct: number): number | null {
  if (peakReturnPct < TRAINER_ARM_PCT) return null;
  const giveback =
    peakReturnPct >= TRAINER_TIGHT_FROM_PCT
      ? TRAINER_TIGHT_GIVEBACK_PCT
      : TRAINER_GIVEBACK_PCT;
  return Math.max(TRAINER_FLOOR_PCT, peakReturnPct - giveback);
}

export function disasterStopBid(
  entryPremium: number,
  quantity: number,
  commissionRoundTrip: number,
): number {
  return round2(
    bidForReturnPct(-TRAINER_STOP_PCT, entryPremium, quantity, commissionRoundTrip),
  );
}

/**
 * One tick of the ladder. The disaster stop is the floor; once the peak
 * return clears the arm, the stop steps up behind the peak and never comes
 * back down. Capped one cent under the peak bid so the tick that sets a new
 * high cannot flatten itself.
 */
export function ratchetProfitLock(input: ProfitLockInput): RatchetStopResult {
  const peakBid = Math.max(input.peakBid ?? input.entryPremium, input.optionBid);
  const floor = disasterStopBid(
    input.entryPremium,
    input.quantity,
    input.commissionRoundTrip,
  );
  const peakReturn = returnOnCostPct(
    peakBid,
    input.entryPremium,
    input.quantity,
    input.commissionRoundTrip,
  );
  const locked = lockedReturnFor(peakReturn);

  if (locked == null) {
    const stopPremium =
      input.stopPremium == null ? floor : Math.max(input.stopPremium, floor);
    return {
      peakBid,
      trailArmed: false,
      stopPremium,
      source: 'INITIAL',
      raised: input.stopPremium == null || stopPremium > input.stopPremium,
    };
  }

  const desired = bidForReturnPct(
    locked,
    input.entryPremium,
    input.quantity,
    input.commissionRoundTrip,
  );
  const capped = round2(Math.min(desired, peakBid - 0.01));
  const stopPremium =
    input.stopPremium == null
      ? Math.max(floor, capped)
      : Math.max(input.stopPremium, floor, capped);

  return {
    peakBid,
    trailArmed: true,
    stopPremium,
    source: 'TRAIL',
    raised: input.stopPremium == null || stopPremium > input.stopPremium,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
