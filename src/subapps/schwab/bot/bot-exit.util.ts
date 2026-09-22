import { BotDirection } from './enums/strategy.enum';

/** Exit reasons emitted on soft stop / target closes (not day-halt reasons). */
export type SoftExitReason =
  | 'PREMIUM_STOP'
  | 'PREMIUM_TARGET'
  | 'TRAIL_STOP'
  | 'UNDERLYING_STOP'
  | 'UNDERLYING_TARGET';

/**
 * Whether the live `stopPremium` is still the level stamped at fill time or
 * one the trail has since raised.
 *
 * Kept separate from the level itself so an exit can be attributed: a trade
 * stopped out at entry × 0.75 and one stopped out after giving back 15% of a
 * peak are different outcomes, and the nightly exit-reason breakdown is only
 * useful if it can tell them apart.
 */
export type StopPremiumSource = 'INITIAL' | 'TRAIL';

export interface ExitLevelInputs {
  entryPremium: number;
  spot: number;
  atr: number | null;
  direction: BotDirection | 'CALL' | 'PUT';
  usePremiumStop: boolean;
  premiumStopPct: number;
  usePremiumTarget: boolean;
  premiumTargetPct: number;
  stopAtrMult: number;
  targetAtrMult: number;
  /** Used when ATR is missing/zero so underlying stops still exist. */
  atrFloor?: number;
}

export interface ExitLevels {
  stopPremium: number | null;
  targetPremium: number | null;
  stopUnderlying: number | null;
  targetUnderlying: number | null;
  atrUsed: number;
}

/** Compute fill-time stop/target levels for an open position. */
export function computeExitLevels(input: ExitLevelInputs): ExitLevels {
  const atrFloor = input.atrFloor ?? 0.5;
  const atrUsed =
    input.atr != null && Number.isFinite(input.atr) && input.atr > 0
      ? input.atr
      : atrFloor;
  const isCall = String(input.direction) === 'CALL';

  const stopPremium = input.usePremiumStop
    ? input.entryPremium * (1 - input.premiumStopPct / 100)
    : null;
  const targetPremium = input.usePremiumTarget
    ? input.entryPremium * (1 + input.premiumTargetPct / 100)
    : null;

  const stopUnderlying = isCall
    ? input.spot - atrUsed * input.stopAtrMult
    : input.spot + atrUsed * input.stopAtrMult;
  const targetUnderlying = isCall
    ? input.spot + atrUsed * input.targetAtrMult
    : input.spot - atrUsed * input.targetAtrMult;

  return {
    stopPremium,
    targetPremium,
    stopUnderlying,
    targetUnderlying,
    atrUsed,
  };
}

export interface RatchetStopInput {
  /** Fill price — reference for both the arm threshold and the peak floor. */
  entryPremium: number;
  /** Current option bid. */
  optionBid: number;
  /** Highest bid seen this trade, or null before the first sample. */
  peakBid: number | null;
  /** Stop currently in force; null when no premium stop is armed yet. */
  stopPremium: number | null;
  trailArmed: boolean;
  /** Arm once bid >= entry × (1 + pct/100). */
  trailArmPct: number;
  /** Once armed, stop >= peak × (1 − pct/100). */
  trailPct: number;
  /** Bid at which a round trip nets zero, commission included. */
  breakevenBid: number;
  /**
   * Bid that banks at least `trailMinLockPct` of premium once armed.
   * `entry × (1 + trailMinLockPct/100)`. Equal to entry when the setting is 0
   * (breakeven-only — the peak trail and commission clamp still apply).
   */
  minLockBid: number;
}

export interface RatchetStopResult {
  peakBid: number;
  trailArmed: boolean;
  stopPremium: number | null;
  source: StopPremiumSource;
  /** True when this call moved the stop up — the engine's cue to persist. */
  raised: boolean;
}

/**
 * Raises the premium stop to protect profit once the trade is far enough in
 * the green, and never lowers it.
 *
 * A stop fixed at fill time keeps risking the same dollars no matter how far
 * the position has run, so a trade 65% of the way to target is still exposed
 * all the way back to entry × (1 − premiumStopPct) — risking realized gains
 * to capture a shrinking remainder. Trailing the peak instead converts a
 * winner into a bounded one.
 *
 * Arming is deliberately gated on a gain threshold rather than trailing from
 * the first tick: 0DTE premium is noisy enough that a trail active at entry
 * would stop out inside the spread on trades that go on to work.
 *
 * Pure, and takes the bid the caller already fetched, so it can run on the
 * streamer's tick path without adding I/O.
 */
export function ratchetPremiumStop(input: RatchetStopInput): RatchetStopResult {
  const peakBid = Math.max(input.peakBid ?? input.entryPremium, input.optionBid);
  const armAt = input.entryPremium * (1 + input.trailArmPct / 100);
  const trailArmed = input.trailArmed || input.optionBid >= armAt;

  if (!trailArmed) {
    return {
      peakBid,
      trailArmed: false,
      stopPremium: input.stopPremium,
      source: 'INITIAL',
      raised: false,
    };
  }

  // Three-way floor: peak trail, commission breakeven, and the operator's
  // minimum locked-in profit. `trailPct` greater than `trailArmPct` would
  // otherwise put the raw trail below entry at arming, locking in a loss.
  const desired = Math.max(
    peakBid * (1 - input.trailPct / 100),
    input.breakevenBid,
    input.minLockBid,
  );
  // A stop at or above the peak fires on the tick that set it, turning the
  // ratchet into an instant exit. With the settings guards in place this
  // should be unreachable; it stays because settings are also editable out
  // of band (direct DB edit, future default change). One cent is the next
  // real SPY 0DTE tick down.
  const capped = Math.min(desired, peakBid - 0.01);
  const stopPremium =
    input.stopPremium == null ? capped : Math.max(input.stopPremium, capped);

  return {
    peakBid,
    trailArmed: true,
    stopPremium,
    // Once armed the floor is at least breakeven, which is always above a
    // fill-time stop, so an armed trail owns the level unconditionally.
    source: 'TRAIL',
    raised: input.stopPremium == null || stopPremium > input.stopPremium,
  };
}

/**
 * Bid at which selling recovers the entry cost plus commission on both legs.
 *
 * Commission is per contract per leg, so it converts to premium terms
 * independently of size — but it is charged on dollars while premium is
 * quoted per share, hence the 100 multiplier.
 */
export function breakevenBidFor(
  entryPremium: number,
  commissionPerContractRoundTrip: number,
): number {
  return entryPremium + commissionPerContractRoundTrip / 100;
}

/**
 * Bid that banks `trailMinLockPct` of premium once the trail arms.
 *
 * `pct === 0` returns the entry itself so the min-lock term is a no-op and
 * the floor falls through to the peak trail and the commission breakeven.
 */
export function minLockBidFor(entryPremium: number, trailMinLockPct: number): number {
  if (trailMinLockPct <= 0) return entryPremium;
  return entryPremium * (1 + trailMinLockPct / 100);
}

export interface SoftExitCheckInput {
  direction: BotDirection | 'CALL' | 'PUT' | null | undefined;
  spot: number;
  /** Option bid (exit mark). Null skips premium checks. */
  optionBid: number | null;
  stopPremium: number | null | undefined;
  targetPremium: number | null | undefined;
  stopUnderlying: number | null | undefined;
  targetUnderlying: number | null | undefined;
  /** Attributes a premium-stop hit to the trail. Defaults to `'INITIAL'`. */
  stopPremiumSource?: StopPremiumSource;
}

/**
 * Decide whether to soft-exit. Stops before targets; premium before underlying
 * so 0DTE bleed is caught even when SPY has barely moved.
 */
export function decideSoftExit(
  input: SoftExitCheckInput,
): SoftExitReason | null {
  const dir = input.direction != null ? String(input.direction) : '';
  const isCall = dir === 'CALL';
  const isPut = dir === 'PUT';
  if (!isCall && !isPut) return null;

  if (
    input.optionBid != null &&
    input.stopPremium != null &&
    input.optionBid <= input.stopPremium
  ) {
    return input.stopPremiumSource === 'TRAIL' ? 'TRAIL_STOP' : 'PREMIUM_STOP';
  }

  if (input.stopUnderlying != null) {
    if (isCall && input.spot <= input.stopUnderlying) return 'UNDERLYING_STOP';
    if (isPut && input.spot >= input.stopUnderlying) return 'UNDERLYING_STOP';
  }

  if (
    input.optionBid != null &&
    input.targetPremium != null &&
    input.optionBid >= input.targetPremium
  ) {
    return 'PREMIUM_TARGET';
  }

  if (input.targetUnderlying != null) {
    if (isCall && input.spot >= input.targetUnderlying)
      return 'UNDERLYING_TARGET';
    if (isPut && input.spot <= input.targetUnderlying)
      return 'UNDERLYING_TARGET';
  }

  return null;
}

/**
 * Whether an open position should be emergency-flattened for a lost stream.
 *
 * The streamer reconnects on its own within a couple seconds for a routine
 * blip, so reacting to the first heartbeat tick that sees the stream down
 * treats an ordinary reconnect as an emergency — realizing a loss at
 * whatever price is available to exit a position that would have been fine
 * moments later. Requiring the outage to outlast `graceMs` (which should
 * itself stay short relative to a 0DTE hold) is what tells the two apart.
 *
 * `disconnectedForMs: null` means "no session at all", which is worse than a
 * disconnect (there's nothing that could reconnect on its own) — treated as
 * an immediate flatten regardless of the grace period.
 *
 * While the bot is armed, `BotEngineService.reconcileStreamerHolds` holds a
 * session open independent of any browser tab, so `null` here should now
 * only mean the pool was at capacity or the session hasn't been reconciled
 * yet — not "nobody has a tab open" (2026-09-21 incident).
 */
export function shouldForceFlattenForSocketLoss(params: {
  hasOpenPosition: boolean;
  disconnectedForMs: number | null;
  graceMs: number;
}): boolean {
  if (!params.hasOpenPosition) return false;
  if (params.disconnectedForMs == null) return true;
  return params.disconnectedForMs > params.graceMs;
}
