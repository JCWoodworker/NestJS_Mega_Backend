import {
  computeExitLevels,
  decideSoftExit,
  shouldForceFlattenForSocketLoss,
} from './bot-exit.util';
import { BotDirection } from './enums/strategy.enum';

describe('bot-exit.util', () => {
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
