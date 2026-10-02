import {
  RatchetStopInput,
  RatchetStopResult,
  SoftExitCheckInput,
  SoftExitReason,
  decideSoftExit,
  ratchetPremiumStop,
} from '@schwab/bot/bot-exit.util';

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
  ratchet: RatchetStopInput;
  exit: Omit<SoftExitCheckInput, 'optionBid' | 'stopPremium' | 'stopPremiumSource'>;
  useScaleOut: boolean;
  scaledOut: boolean;
  quantity: number;
  entryPremium: number;
  /** Scratch a trade that is still under +2% after this many seconds. */
  useTimeStop?: boolean;
  openedAt?: number;
  now?: number;
  timeStopSeconds?: number;
}

/**
 * One option tick: raise the trail, then leave, then take a partial.
 * A stop that is already through beats the scale so a winner is not
 * half-sold into a level that should flatten the whole position.
 */
export function decideTickExit(input: TickExitInput): TickExitDecision {
  const ratchet = ratchetPremiumStop(input.ratchet);
  const limitMs = (input.timeStopSeconds ?? 180) * 1000;
  if (
    input.useTimeStop &&
    input.openedAt != null &&
    input.now != null &&
    input.now - input.openedAt > limitMs &&
    input.ratchet.optionBid < input.entryPremium * 1.02
  ) {
    return {
      type: 'EXIT',
      reason: 'TIME_STOP',
      quantity: input.quantity,
      ratchet,
    };
  }
  const fullExit = decideSoftExit({
    ...input.exit,
    optionBid: input.ratchet.optionBid,
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
      bid: input.ratchet.optionBid,
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
