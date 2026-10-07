import { decideTickExit } from './bot-v2-tick-exit.util';

describe('decideTickExit', () => {
  // One lot at $7.00, $1.30 round trip. Peak already past the +8% arm.
  const lock = {
    entryPremium: 7,
    optionBid: 7.84,
    peakBid: 7.84,
    stopPremium: 6.17,
    quantity: 1,
    commissionRoundTrip: 1.3,
  };
  const exit = {
    direction: 'CALL' as const,
    spot: 6700,
    targetPremium: null,
    stopUnderlying: null,
    targetUnderlying: null,
  };

  it('sells half at +10% before a stop when scale-out is on and there are two lots', () => {
    const decision = decideTickExit({
      lock: { ...lock, quantity: 4, commissionRoundTrip: 5.2 },
      exit,
      useScaleOut: true,
      scaledOut: false,
      quantity: 4,
      entryPremium: 7,
    });
    expect(decision.type).toBe('SCALE_OUT');
    if (decision.type === 'SCALE_OUT') expect(decision.quantity).toBe(2);
  });

  it('flattens on the lock instead of scaling', () => {
    const decision = decideTickExit({
      lock: { ...lock, optionBid: 7.1, stopPremium: 7.16 },
      exit,
      useScaleOut: true,
      scaledOut: false,
      quantity: 4,
      entryPremium: 7,
    });
    expect(decision.type).toBe('EXIT');
    if (decision.type === 'EXIT') expect(decision.reason).toBe('TRAIL_STOP');
  });

  it('holds when scale-out is off', () => {
    const decision = decideTickExit({
      lock,
      exit,
      useScaleOut: false,
      scaledOut: false,
      quantity: 1,
      entryPremium: 7,
    });
    expect(decision.type).toBe('HOLD');
  });

  it('exits PREMIUM_STOP through the −12% floor before any lock', () => {
    const decision = decideTickExit({
      lock: { ...lock, optionBid: 6.1, peakBid: 7.2, stopPremium: null },
      exit,
      useScaleOut: false,
      scaledOut: false,
      quantity: 1,
      entryPremium: 7,
    });
    expect(decision.type).toBe('EXIT');
    if (decision.type === 'EXIT') expect(decision.reason).toBe('PREMIUM_STOP');
  });

  const clock = {
    exit,
    useScaleOut: false,
    scaledOut: false,
    quantity: 1,
    entryPremium: 7,
    useTimeStop: true,
    openedAt: 0,
    timeStopSeconds: 180,
  };

  it('scratches a red trade once the clock runs out', () => {
    const decision = decideTickExit({
      ...clock,
      lock: { ...lock, optionBid: 6.9, peakBid: 7.1, stopPremium: null },
      now: 181_000,
    });
    expect(decision.type).toBe('EXIT');
    if (decision.type === 'EXIT') expect(decision.reason).toBe('TIME_STOP');
  });

  it('scratches a trade that has not covered its fees once the clock runs out', () => {
    // Breakeven on one lot is 7.013; 7.01 is still a loss after the round trip.
    const decision = decideTickExit({
      ...clock,
      lock: { ...lock, optionBid: 7.01, peakBid: 7.1, stopPremium: null },
      now: 181_000,
    });
    expect(decision.type).toBe('EXIT');
    if (decision.type === 'EXIT') expect(decision.reason).toBe('TIME_STOP');
  });

  it('gives a green trade under +2% until twice the clock', () => {
    const green = { ...lock, optionBid: 7.05, peakBid: 7.1, stopPremium: null };
    expect(decideTickExit({ ...clock, lock: green, now: 181_000 }).type).toBe('HOLD');
    expect(decideTickExit({ ...clock, lock: green, now: 359_000 }).type).toBe('HOLD');
    const late = decideTickExit({ ...clock, lock: green, now: 361_000 });
    expect(late.type).toBe('EXIT');
    if (late.type === 'EXIT') expect(late.reason).toBe('TIME_STOP');
  });

  it('pushes the deadline out one clock after a new bid high', () => {
    const green = { ...lock, optionBid: 7.05, peakBid: 7.1, stopPremium: null };
    // New high at 5:00 → deadline moves from 6:00 to 8:00.
    expect(decideTickExit({ ...clock, lock: green, peakAt: 300_000, now: 361_000 }).type).toBe('HOLD');
    expect(decideTickExit({ ...clock, lock: green, peakAt: 300_000, now: 479_000 }).type).toBe('HOLD');
    const late = decideTickExit({ ...clock, lock: green, peakAt: 300_000, now: 481_000 });
    expect(late.type).toBe('EXIT');
    if (late.type === 'EXIT') expect(late.reason).toBe('TIME_STOP');
  });

  it('never lets a trade under +2% past three clocks', () => {
    const green = { ...lock, optionBid: 7.05, peakBid: 7.1, stopPremium: null };
    const late = decideTickExit({ ...clock, lock: green, peakAt: 530_000, now: 541_000 });
    expect(late.type).toBe('EXIT');
    if (late.type === 'EXIT') expect(late.reason).toBe('TIME_STOP');
  });

  it('a new high does not save a trade that fell back under breakeven', () => {
    const red = { ...lock, optionBid: 6.95, peakBid: 7.1, stopPremium: null };
    const decision = decideTickExit({ ...clock, lock: red, peakAt: 170_000, now: 181_000 });
    expect(decision.type).toBe('EXIT');
    if (decision.type === 'EXIT') expect(decision.reason).toBe('TIME_STOP');
  });

  it('never clocks out a trade that is up +2% or more', () => {
    const going = { ...lock, optionBid: 7.15, peakBid: 7.15, stopPremium: null };
    expect(decideTickExit({ ...clock, lock: going, now: 10 * 60_000 }).type).toBe('HOLD');
  });
});
