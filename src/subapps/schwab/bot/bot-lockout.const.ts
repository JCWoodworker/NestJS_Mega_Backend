import { BotLane } from './enums/bot-lane.enum';

/**
 * Kill-switch and precautionary halts. An operator can clear these same
 * session on either lane via POST /bot/unlock.
 */
export const OPERATOR_UNLOCKABLE_REASONS = new Set([
  'KILL_SWITCH',
  'LIVE_DISABLED',
  'HARD_FLATTEN_EOD',
  'SOCKET_LOSS',
]);

/**
 * Account-level P&L halts. Paper training clears these (unlock, paper reset,
 * and the paper heartbeat) so a red day does not end the session. Live still
 * refuses them until the next trading day.
 */
export const PAPER_TRAINING_LOCKOUT_REASONS = new Set([
  'MAX_LOSS_USD',
  'MAX_LOSS_PCT',
  'PROFIT_TARGET_USD',
  'PROFIT_TARGET_PCT_DAY_START',
  'PROFIT_TARGET_PCT_CURRENT',
]);

export function isPaperTrainingLockout(reason: string | null): boolean {
  return reason != null && PAPER_TRAINING_LOCKOUT_REASONS.has(reason);
}

export function isOperatorUnlockable(
  lane: BotLane | null,
  reason: string | null,
): boolean {
  if (!reason) return true;
  if (OPERATOR_UNLOCKABLE_REASONS.has(reason)) return true;
  return lane !== BotLane.BOT_LIVE && isPaperTrainingLockout(reason);
}
