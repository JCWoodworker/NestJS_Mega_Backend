import { BotDirection } from './enums/strategy.enum';

/** Exit reasons emitted on soft stop / target closes (not day-halt reasons). */
export type SoftExitReason =
  | 'PREMIUM_STOP'
  | 'PREMIUM_TARGET'
  | 'UNDERLYING_STOP'
  | 'UNDERLYING_TARGET';

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

export interface SoftExitCheckInput {
  direction: BotDirection | 'CALL' | 'PUT' | null | undefined;
  spot: number;
  /** Option bid (exit mark). Null skips premium checks. */
  optionBid: number | null;
  stopPremium: number | null | undefined;
  targetPremium: number | null | undefined;
  stopUnderlying: number | null | undefined;
  targetUnderlying: number | null | undefined;
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
    return 'PREMIUM_STOP';
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
