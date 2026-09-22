import {
  breakevenBidFor,
  computeExitLevels,
  decideSoftExit,
  minLockBidFor,
  ratchetPremiumStop,
  RatchetStopInput,
  shouldForceFlattenForSocketLoss,
} from './bot-exit.util';
import { BotDirection } from './enums/strategy.enum';

describe('bot-exit.util', () => {
  /**
   * The 2026-09-21 live trade that motivated the trail: SPY 769 CALL x7,
   * filled 0.92, bid 1.16 at 65% of the way to a 0.40 target, with the stop
   * still parked at 0.69 — risking $329 of open profit to make $90.
   */
  const trailCase = (overrides: Partial<RatchetStopInput> = {}) => ({
    entryPremium: 0.92,
    optionBid: 1.16,
    peakBid: null,
    stopPremium: 0.69,
    trailArmed: false,
    trailArmPct: 20,
    trailPct: 15,
    breakevenBid: breakevenBidFor(0.92, 1.3),
    minLockBid: minLockBidFor(0.92, 5),
    ...overrides,
  });

  describe('ratchetPremiumStop', () => {
    it('leaves the fill-time stop alone below the arm threshold', () => {
      // +8.7% — short of the 20% arm.
      const result = ratchetPremiumStop(trailCase({ optionBid: 1.0 }));

      expect(result.trailArmed).toBe(false);
      expect(result.stopPremium).toBe(0.69);
      expect(result.source).toBe('INITIAL');
      expect(result.raised).toBe(false);
      // Peak still tracks, so arming later trails from the real high.
      expect(result.peakBid).toBeCloseTo(1.0, 6);
    });

    it('does not arm one cent early', () => {
      const armAt = 0.92 * 1.2;
      const justUnder = ratchetPremiumStop(
        trailCase({ optionBid: armAt - 0.01 }),
      );
      const exactly = ratchetPremiumStop(trailCase({ optionBid: armAt }));

      expect(justUnder.trailArmed).toBe(false);
      expect(exactly.trailArmed).toBe(true);
    });

    it('raises the stop to the trailed peak once armed', () => {
      const result = ratchetPremiumStop(trailCase());

      expect(result.trailArmed).toBe(true);
      expect(result.source).toBe('TRAIL');
      expect(result.raised).toBe(true);
      // Peak trail 1.16 × 0.85 = 0.986 beats min-lock 0.966.
      expect(result.stopPremium).toBeCloseTo(0.986, 6);
      expect(result.stopPremium!).toBeGreaterThan(0.92);
    });

    it('banks min-lock at arm when it exceeds the peak trail', () => {
      // Arming at +20% with a 15% trail: peak trail = 1.104 × 0.85 = 0.9384,
      // min-lock at +5% = 0.966 — min-lock wins.
      const result = ratchetPremiumStop(
        trailCase({ optionBid: 1.104, peakBid: null }),
      );
      expect(result.trailArmed).toBe(true);
      expect(result.stopPremium).toBeCloseTo(minLockBidFor(0.92, 5), 6);
    });

    it('with minLock 0 reproduces breakeven-only behaviour', () => {
      const result = ratchetPremiumStop(
        trailCase({
          optionBid: 1.104,
          trailPct: 25,
          minLockBid: minLockBidFor(0.92, 0),
        }),
      );
      expect(result.stopPremium).toBeCloseTo(breakevenBidFor(0.92, 1.3), 6);
    });

    it('caps a lock above the arm so the stop cannot sit above the market', () => {
      // Impossible config: lock 25% as soon as up 20%. Without the cap the
      // stop would be 1.15 against a 1.104 bid and fire immediately.
      const result = ratchetPremiumStop(
        trailCase({
          optionBid: 1.104,
          minLockBid: minLockBidFor(0.92, 25),
        }),
      );
      expect(result.stopPremium!).toBeLessThan(result.peakBid);
      expect(result.stopPremium).toBeCloseTo(1.104 - 0.01, 6);
    });

    it('never lowers the stop when the bid pulls back off the peak', () => {
      const armed = ratchetPremiumStop(trailCase());
      const pulledBack = ratchetPremiumStop(
        trailCase({
          optionBid: 1.05,
          peakBid: armed.peakBid,
          stopPremium: armed.stopPremium,
          trailArmed: true,
        }),
      );

      expect(pulledBack.peakBid).toBeCloseTo(1.16, 6);
      expect(pulledBack.stopPremium).toBeCloseTo(armed.stopPremium!, 6);
      expect(pulledBack.raised).toBe(false);
    });

    it('cannot trigger its own trail on the tick that sets a new peak', () => {
      const result = ratchetPremiumStop(
        trailCase({ optionBid: 1.4, peakBid: 1.16, trailArmed: true }),
      );

      // Stop is derived from the new peak, so bid > stop by construction.
      expect(result.peakBid).toBeCloseTo(1.4, 6);
      expect(result.stopPremium!).toBeLessThan(1.4);
    });

    it('clamps to breakeven when trailPct exceeds trailArmPct', () => {
      // Arming at +20% with a 25% trail puts the raw level at 0.828, under
      // the 0.92 entry — "locking in profit" would lock in a loss.
      const result = ratchetPremiumStop(
        trailCase({
          optionBid: 1.104,
          trailPct: 25,
          minLockBid: minLockBidFor(0.92, 0),
        }),
      );

      expect(result.trailArmed).toBe(true);
      expect(result.stopPremium).toBeCloseTo(breakevenBidFor(0.92, 1.3), 6);
      expect(result.stopPremium!).toBeGreaterThan(0.92);
    });

    it('introduces a stop when the fill-time premium stop was disarmed', () => {
      const result = ratchetPremiumStop(trailCase({ stopPremium: null }));

      expect(result.stopPremium).toBeCloseTo(0.986, 6);
      expect(result.raised).toBe(true);
    });
  });

  describe('breakevenBidFor', () => {
    it('covers commission on both legs, independent of size', () => {
      // $0.65/contract/leg = $1.30 round trip = 1.3 cents of premium.
      expect(breakevenBidFor(0.92, 1.3)).toBeCloseTo(0.933, 6);
    });
  });

  describe('minLockBidFor', () => {
    it('returns entry when pct is zero', () => {
      expect(minLockBidFor(0.92, 0)).toBe(0.92);
    });

    it('scales entry by the lock pct', () => {
      expect(minLockBidFor(0.92, 5)).toBeCloseTo(0.966, 6);
    });
  });

  describe('computeExitLevels', () => {
    it('computes 25% premium stop and ATR-scaled SPY levels for CALL', () => {
      const levels = computeExitLevels({
        entryPremium: 0.73,
        spot: 770.23,
        atr: 0.15,
        direction: BotDirection.CALL,
        usePremiumStop: true,
        premiumStopPct: 25,
        usePremiumTarget: true,
        premiumTargetPct: 40,
        stopAtrMult: 1.5,
        targetAtrMult: 2.5,
      });
      expect(levels.stopPremium).toBeCloseTo(0.73 * 0.75, 6);
      expect(levels.targetPremium).toBeCloseTo(0.73 * 1.4, 6);
      expect(levels.stopUnderlying).toBeCloseTo(770.23 - 0.15 * 1.5, 6);
      expect(levels.targetUnderlying).toBeCloseTo(770.23 + 0.15 * 2.5, 6);
    });

    it('omits premium levels when flags are off', () => {
      const levels = computeExitLevels({
        entryPremium: 1,
        spot: 100,
        atr: 1,
        direction: 'PUT',
        usePremiumStop: false,
        premiumStopPct: 25,
        usePremiumTarget: false,
        premiumTargetPct: 40,
        stopAtrMult: 1.5,
        targetAtrMult: 2.5,
      });
      expect(levels.stopPremium).toBeNull();
      expect(levels.targetPremium).toBeNull();
      expect(levels.stopUnderlying).toBeCloseTo(100 + 1.5, 6);
    });
  });

  describe('decideSoftExit — 2026-09-04 bleed case', () => {
    it('fires PREMIUM_STOP when bid bleeds 29% while SPY barely moved', () => {
      // Historical: entry 0.73 @ SPY 770.23; manual exit bid ~0.52 @ 769.85.
      // Old hardcoded SPY stop was 768.23 — would NOT have fired.
      const reason = decideSoftExit({
        direction: BotDirection.CALL,
        spot: 769.85,
        optionBid: 0.52,
        stopPremium: 0.73 * 0.75, // 25% → ~0.5475
        targetPremium: 0.73 * 1.4,
        stopUnderlying: 770.23 - 2, // old fixed stop (~768.23)
        targetUnderlying: 770.23 + 3,
      });
      expect(reason).toBe('PREMIUM_STOP');
    });

    it('does not fire underlying stop when SPY is above stop', () => {
      const reason = decideSoftExit({
        direction: BotDirection.CALL,
        spot: 769.85,
        optionBid: null,
        stopPremium: null,
        targetPremium: null,
        stopUnderlying: 768.23,
        targetUnderlying: 773.23,
      });
      expect(reason).toBeNull();
    });

    it('fires UNDERLYING_STOP for CALL when spot breaches', () => {
      expect(
        decideSoftExit({
          direction: 'CALL',
          spot: 769.9,
          optionBid: null,
          stopPremium: null,
          targetPremium: null,
          stopUnderlying: 770.0,
          targetUnderlying: 775,
        }),
      ).toBe('UNDERLYING_STOP');
    });

    it('fires PREMIUM_TARGET when bid expands', () => {
      expect(
        decideSoftExit({
          direction: BotDirection.CALL,
          spot: 771,
          optionBid: 1.1,
          stopPremium: 0.5,
          targetPremium: 1.0,
          stopUnderlying: 768,
          targetUnderlying: 775,
        }),
      ).toBe('PREMIUM_TARGET');
    });

    it('reports TRAIL_STOP when the level that fired came from the trail', () => {
      // Same comparison, different meaning: a profitable give-back, not a
      // fill-time stop-out. The exit-reason breakdown depends on the split.
      expect(
        decideSoftExit({
          direction: BotDirection.CALL,
          spot: 770,
          optionBid: 0.98,
          stopPremium: 0.986,
          targetPremium: 0.92 * 1.4,
          stopUnderlying: 765,
          targetUnderlying: 775,
          stopPremiumSource: 'TRAIL',
        }),
      ).toBe('TRAIL_STOP');
    });

    it('still reports PREMIUM_STOP when the source is absent or INITIAL', () => {
      const args = {
        direction: BotDirection.CALL as const,
        spot: 770,
        optionBid: 0.68,
        stopPremium: 0.69,
        targetPremium: null,
        stopUnderlying: 765,
        targetUnderlying: 775,
      };
      expect(decideSoftExit(args)).toBe('PREMIUM_STOP');
      expect(
        decideSoftExit({ ...args, stopPremiumSource: 'INITIAL' }),
      ).toBe('PREMIUM_STOP');
    });
  });

  /**
   * 2026-09-18 prod incident: two open positions were force-flattened for
   * losses within the first 15 minutes of the session, both during what
   * turned out to be a routine reconnect. This is the fix.
   */
  describe('shouldForceFlattenForSocketLoss', () => {
    it('does nothing without an open position, however long the outage', () => {
      expect(
        shouldForceFlattenForSocketLoss({
          hasOpenPosition: false,
          disconnectedForMs: 999_999,
          graceMs: 15_000,
        }),
      ).toBe(false);
    });

    it('tolerates an outage inside the grace period', () => {
      expect(
        shouldForceFlattenForSocketLoss({
          hasOpenPosition: true,
          disconnectedForMs: 5_000,
          graceMs: 15_000,
        }),
      ).toBe(false);
    });

    it('flattens once the outage outlasts the grace period', () => {
      expect(
        shouldForceFlattenForSocketLoss({
          hasOpenPosition: true,
          disconnectedForMs: 15_001,
          graceMs: 15_000,
        }),
      ).toBe(true);
    });

    it('flattens immediately when there is no session at all', () => {
      // null means "no session that could reconnect", not "just reconnected" —
      // worse than a disconnect, so the grace period does not apply.
      expect(
        shouldForceFlattenForSocketLoss({
          hasOpenPosition: true,
          disconnectedForMs: null,
          graceMs: 15_000,
        }),
      ).toBe(true);
    });

    it('does not flatten while fully connected', () => {
      expect(
        shouldForceFlattenForSocketLoss({
          hasOpenPosition: true,
          disconnectedForMs: 0,
          graceMs: 15_000,
        }),
      ).toBe(false);
    });
  });
});
