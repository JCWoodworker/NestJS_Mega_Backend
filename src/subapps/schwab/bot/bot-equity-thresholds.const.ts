/** Live arming / entry floor. Paper training does not use this. */
export const MIN_EQUITY_LIVE = 5000;

/** @deprecated alias — this is the live floor. Paper uses MIN_EQUITY_PAPER. */
export const MIN_EQUITY = MIN_EQUITY_LIVE;

/**
 * Paper training keeps scanning through a drawn-down ledger. A negative
 * balance still cannot fund a contract.
 */
export const MIN_EQUITY_PAPER = 0;

/** Default / reset paper ledger. Training bank, not a thin-account mimic. */
export const DEFAULT_PAPER_EQUITY = 10000;
