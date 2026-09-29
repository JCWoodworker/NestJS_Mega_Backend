import { MIN_EQUITY } from './bot-equity-thresholds.const';
import {
  decideSoftExit,
  ratchetPremiumStop,
  shouldForceFlattenForSocketLoss,
} from './bot-exit.util';
import { isDirectionAllowed } from './bot-strategy.util';

/**
 * Behaviour the weekly improvement agent must never change.
 *
 * The agent may now rewrite entry rules, strike selection and exit maths, and
 * registering a new strategy means editing the engine — the same file that
 * holds the kill switch and the flatten paths. A path allowlist cannot tell a
 * strategy edit from a safety edit inside one file, so these assert the
 * behaviour directly and CI requires them on every `bot(improve):` pull
 * request.
 *
 * These are not tests of whether the bot makes money. They are the properties
 * that decide whether a bad week costs a losing trade or costs the ability to
 * get out of one. If a change here looks necessary, it needs a human deciding
 * it on purpose, not a tuning run.
 */

describe('kill path: socket loss', () => {
  it('flattens immediately when there is no session at all', () => {
    expect(
      shouldForceFlattenForSocketLoss({
        hasOpenPosition: true,
        disconnectedForMs: null,
        graceMs: 10_000,
      }),
    ).toBe(true);
  });

  it('flattens once an outage outlasts the grace period', () => {
    expect(
      shouldForceFlattenForSocketLoss({
        hasOpenPosition: true,
        disconnectedForMs: 10_001,
        graceMs: 10_000,
      }),
    ).toBe(true);
  });

  /**
   * The other half of the invariant: treating a routine reconnect as an
   * emergency realizes a loss on a position that would have been fine.
   */
  it('rides out a blip inside the grace period', () => {
    expect(
      shouldForceFlattenForSocketLoss({
        hasOpenPosition: true,
        disconnectedForMs: 1_000,
        graceMs: 10_000,
      }),
    ).toBe(false);
  });

  it('never flattens when flat', () => {
    expect(
      shouldForceFlattenForSocketLoss({
        hasOpenPosition: false,
        disconnectedForMs: null,
        graceMs: 10_000,
      }),
    ).toBe(false);
  });
});

describe('exit precedence', () => {
  const base = {
    direction: 'CALL' as const,
    spot: 600,
    optionBid: 1,
    stopPremium: null,
    targetPremium: null,
    stopUnderlying: null,
    targetUnderlying: null,
  };

  /**
   * Stops must outrank targets. A bar that trips both is a bar the position
   * was in danger, and resolving it as a win would flatter every result the
   * loop produces.
   */
  it('takes the stop when stop and target both trip', () => {
    expect(
      decideSoftExit({
        ...base,
        optionBid: 1,
        stopPremium: 1.5,
        targetPremium: 0.5,
      }),
    ).toBe('PREMIUM_STOP');
  });

  /** Premium before underlying, so 0DTE bleed is caught on a flat tape. */
  it('takes the premium stop before the underlying stop', () => {
    expect(
      decideSoftExit({
        ...base,
        optionBid: 0.4,
        stopPremium: 0.5,
        stopUnderlying: 610,
      }),
    ).toBe('PREMIUM_STOP');
  });

  it('still stops on the underlying when no bid is available', () => {
    expect(
      decideSoftExit({
        ...base,
        optionBid: null,
        stopPremium: 0.5,
        stopUnderlying: 601,
      }),
    ).toBe('UNDERLYING_STOP');
  });

  /** A stop hit after the trail armed must stay distinguishable from one at fill. */
  it('attributes a trailed stop separately', () => {
    expect(
      decideSoftExit({
        ...base,
        optionBid: 1,
        stopPremium: 1.2,
        stopPremiumSource: 'TRAIL',
      }),
    ).toBe('TRAIL_STOP');
  });

  it('does nothing without a direction', () => {
    expect(
      decideSoftExit({ ...base, direction: null, stopPremium: 5 }),
    ).toBeNull();
  });
});

describe('trailing stop never loosens', () => {
  const base = {
    entryPremium: 1,
    trailArmPct: 10,
    trailPct: 15,
    breakevenBid: 1.02,
    minLockBid: 1.05,
  };

  it('stays dormant below the arm threshold', () => {
    const result = ratchetPremiumStop({
      ...base,
      optionBid: 1.05,
      peakBid: null,
      stopPremium: 0.75,
      trailArmed: false,
    });

    expect(result.trailArmed).toBe(false);
    expect(result.stopPremium).toBe(0.75);
  });

  /**
   * The point of the ratchet: once armed the stop may rise but must never
   * fall back, or a pullback would hand back locked profit.
   */
  it('does not lower a stop once armed', () => {
    const armed = ratchetPremiumStop({
      ...base,
      optionBid: 1.5,
      peakBid: null,
      stopPremium: 0.75,
      trailArmed: false,
    });
    const pullback = ratchetPremiumStop({
      ...base,
      optionBid: 1.1,
      peakBid: armed.peakBid,
      stopPremium: armed.stopPremium,
      trailArmed: true,
    });

    expect(armed.trailArmed).toBe(true);
    expect(pullback.stopPremium).toBeGreaterThanOrEqual(
      armed.stopPremium as number,
    );
  });

  it('keeps the peak monotonic', () => {
    const high = ratchetPremiumStop({
      ...base,
      optionBid: 2,
      peakBid: null,
      stopPremium: 0.75,
      trailArmed: false,
    });
    const lower = ratchetPremiumStop({
      ...base,
      optionBid: 1.1,
      peakBid: high.peakBid,
      stopPremium: high.stopPremium,
      trailArmed: true,
    });

    expect(lower.peakBid).toBe(high.peakBid);
  });

  it('never locks in worse than commission breakeven once armed', () => {
    const result = ratchetPremiumStop({
      ...base,
      optionBid: 1.2,
      peakBid: null,
      stopPremium: 0.75,
      trailArmed: false,
    });

    expect(result.stopPremium).toBeGreaterThanOrEqual(base.breakevenBid);
  });
});

describe('direction gating', () => {
  it('refuses a direction the operator disabled', () => {
    expect(
      isDirectionAllowed('PUT', {
        directionsEnabled: ['CALL'],
        canBuyCalls: true,
        canBuyPuts: true,
      }),
    ).toBe(false);
  });

  /** Capability is the account's answer, not a preference the bot may override. */
  it('refuses a direction the account cannot trade', () => {
    expect(
      isDirectionAllowed('PUT', {
        directionsEnabled: ['CALL', 'PUT'],
        canBuyCalls: true,
        canBuyPuts: false,
      }),
    ).toBe(false);
  });
});

describe('equity floor', () => {
  /**
   * Pinned deliberately. Commission and spread on a 0DTE round trip make a
   * thinner live account negative-expectancy regardless of the strategy, so
   * this is not a knob a tuning run gets to relax. Paper training is a
   * separate, explicit exception: the paper floor stays at 0.
   */
  it('holds the live arming floor at 5000', () => {
    expect(MIN_EQUITY).toBe(5000);
  });
});
