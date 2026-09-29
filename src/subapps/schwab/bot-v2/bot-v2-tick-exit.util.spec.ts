import { breakevenBidFor, minLockBidFor } from '@schwab/bot/bot-exit.util';

import { decideTickExit } from './bot-v2-tick-exit.util';

describe('decideTickExit', () => {
  const ratchet = {
    entryPremium: 1,
    optionBid: 1.12,
    peakBid: 1.12,
    stopPremium: 0.75,
    trailArmed: true,
    trailArmPct: 8,
    trailPct: 15,
    breakevenBid: breakevenBidFor(1, 1.3),
    minLockBid: minLockBidFor(1, 5),
  };

  it('sells half at +10% before a stop or target', () => {
    const decision = decideTickExit({
      ratchet,
      exit: {
        direction: 'CALL',
        spot: 500,
        targetPremium: 1.22,
        stopUnderlying: 490,
        targetUnderlying: 510,
      },
      useScaleOut: true,
      scaledOut: false,
      quantity: 4,
      entryPremium: 1,
    });
    expect(decision.type).toBe('SCALE_OUT');
    if (decision.type === 'SCALE_OUT') expect(decision.quantity).toBe(2);
  });

  it('flattens on the trail instead of scaling', () => {
    const decision = decideTickExit({
      ratchet: { ...ratchet, optionBid: 1.04, stopPremium: 1.05 },
      exit: {
        direction: 'CALL',
        spot: 500,
        targetPremium: 1.22,
        stopUnderlying: null,
        targetUnderlying: null,
      },
      useScaleOut: true,
      scaledOut: false,
      quantity: 4,
      entryPremium: 1,
    });
    expect(decision.type).toBe('EXIT');
    if (decision.type === 'EXIT') expect(decision.reason).toBe('TRAIL_STOP');
  });

  it('holds when scale-out is off', () => {
    const decision = decideTickExit({
      ratchet,
      exit: {
        direction: 'CALL',
        spot: 500,
        targetPremium: 1.22,
        stopUnderlying: null,
        targetUnderlying: null,
      },
      useScaleOut: false,
      scaledOut: false,
      quantity: 4,
      entryPremium: 1,
    });
    expect(decision.type).toBe('HOLD');
  });
});
