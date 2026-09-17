/** Shared floor for BOT_PAPER and BOT_LIVE entries / arming / lane-switch. */
export const MIN_EQUITY = 5000;

/** @deprecated alias — paper now uses the same floor as live. */
export const MIN_EQUITY_PAPER = MIN_EQUITY;

/** @deprecated alias — prefer MIN_EQUITY. */
export const MIN_EQUITY_LIVE = MIN_EQUITY;

/**
 * Default / reset paper ledger size — just above the min floor so paper
 * mimics a thin live account near the viability threshold.
 */
export const DEFAULT_PAPER_EQUITY = 6000;
