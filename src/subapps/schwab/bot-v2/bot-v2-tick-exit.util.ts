import {
  RatchetStopResult,
  SoftExitCheckInput,
  SoftExitReason,
  decideSoftExit,
} from '@schwab/bot/bot-exit.util';

import { ProfitLockInput, ratchetProfitLock } from './bot-v2-profit-lock.util';
import { scaleOutQuantity, shouldScaleOut } from './bot-v2-scale.util';

export type V2ExitReason = SoftExitReason | 'SCALE_OUT' | 'TIME_STOP';

export type TickExitDecision =
  | { type: 'HOLD'; ratchet: RatchetStopResult }
  | {
      type: 'SCALE_OUT';
      quantity: number;
      ratchet: RatchetStopResult;
    }
  | {
      type: 'EXIT';
      reason: SoftExitReason | 'TIME_STOP';
      quantity: number;
      ratchet: RatchetStopResult;
    };

export interface TickExitInput {
  lock: ProfitLockInput;
  exit: Omit<SoftExitCheckInput, 'optionBid' | 'stopPremium' | 'stopPremiumSource'>;
  useScaleOut: boolean;
  scaledOut: boolean;
  quantity: number;
  entryPremium: number;
  /**
   * Scratch a trade that has not got going. After this many seconds a bid
   * under breakeven (fees covered) sells at once. A bid that is green but
   * still under +2% gets until twice the clock, and each new bid high after
   * that pushes the deadline out one more clock, to a hard cap of three.
   */
  useTimeStop?: boolean;
  openedAt?: number;
  /** When the bid last printed a new high; the fill time when unknown. */
  peakAt?: number | null;
  now?: number;
  timeStopSeconds?: number;
}

/** Gain on the premium the clock still counts as "not working". */
export const TIME_STOP_GOING_MULT = 1.02;
/** A green trade under +2% gets at least this many clocks. */
export const TIME_STOP_GREEN_CLOCKS = 2;
/** No trade under +2% lives past this many clocks, new highs or not. */
export const TIME_STOP_MAX_CLOCKS = 3;

export function timeStopDue(input: TickExitInput): boolean {
  if (!input.useTimeStop || input.openedAt == null || input.now == null) return false;
  const limitMs = (input.timeStopSeconds ?? 180) * 1000;
  const heldMs = input.now - input.openedAt;
  if (heldMs <= limitMs) return false;
  const bid = input.lock.optionBid;
  const breakevenBid =
    input.entryPremium +
    input.lock.commissionRoundTrip / (100 * Math.max(1, input.lock.quantity));
  if (bid < breakevenBid) return true;
  if (bid >= input.entryPremium * TIME_STOP_GOING_MULT) return false;
  if (heldMs > limitMs * TIME_STOP_MAX_CLOCKS) return true;
  const sinceHighMs = input.now - (input.peakAt ?? input.openedAt);
  return heldMs > limitMs * TIME_STOP_GREEN_CLOCKS && sinceHighMs > limitMs;
}

/**
 * One option tick: step the profit lock, then leave, then take a partial.
 * A stop that is already through beats the scale so a winner is not
 * half-sold into a level that should flatten the whole position.
 */
export function decideTickExit(input: TickExitInput): TickExitDecision {
  const ratchet = ratchetProfitLock(input.lock);
  if (timeStopDue(input)) {
    return {
      type: 'EXIT',
      reason: 'TIME_STOP',
      quantity: input.quantity,
      ratchet,
    };
  }
  const fullExit = decideSoftExit({
    ...input.exit,
    optionBid: input.lock.optionBid,
    stopPremium: ratchet.stopPremium,
    stopPremiumSource: ratchet.source,
  });
  if (fullExit) {
    return {
      type: 'EXIT',
      reason: fullExit,
      quantity: input.quantity,
      ratchet,
    };
  }
  if (
    shouldScaleOut({
      enabled: input.useScaleOut,
      scaledOut: input.scaledOut,
      quantity: input.quantity,
      entryPremium: input.entryPremium,
      bid: input.lock.optionBid,
    })
  ) {
    return {
      type: 'SCALE_OUT',
      quantity: scaleOutQuantity(input.quantity),
      ratchet,
    };
  }
  return { type: 'HOLD', ratchet };
}
