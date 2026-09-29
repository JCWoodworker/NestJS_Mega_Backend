import {
  RatchetStopInput,
  RatchetStopResult,
  SoftExitCheckInput,
  SoftExitReason,
  decideSoftExit,
  ratchetPremiumStop,
} from '@schwab/bot/bot-exit.util';

import { scaleOutQuantity, shouldScaleOut } from './bot-v2-scale.util';

export type V2ExitReason = SoftExitReason | 'SCALE_OUT';

export type TickExitDecision =
  | { type: 'HOLD'; ratchet: RatchetStopResult }
  | {
      type: 'SCALE_OUT';
      quantity: number;
      ratchet: RatchetStopResult;
    }
  | {
      type: 'EXIT';
      reason: SoftExitReason;
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
}

/**
 * One option tick: raise the trail, then leave, then take a partial.
 * A stop that is already through beats the scale so a winner is not
 * half-sold into a level that should flatten the whole position.
 */
export function decideTickExit(input: TickExitInput): TickExitDecision {
  const ratchet = ratchetPremiumStop(input.ratchet);
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
