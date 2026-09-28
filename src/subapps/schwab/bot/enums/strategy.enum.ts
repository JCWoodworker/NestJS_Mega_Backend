export enum BotStrategy {
  VWAP_PULLBACK = 'VWAP_PULLBACK',
  ORB_5M = 'ORB_5M',
  /** The pre-fix 100-bar VWAP, kept as a named rule so it can be tested. */
  VWAP_ROLLING_100 = 'VWAP_ROLLING_100',
  VWAP_REVERSION = 'VWAP_REVERSION',
  ORB_RETEST = 'ORB_RETEST',
  EMA_MOMENTUM = 'EMA_MOMENTUM',
  RANGE_FADE = 'RANGE_FADE',
}

export enum BotCombineMode {
  /** AND — every enabled strategy must have a signal and agree on direction. */
  CONFIRMING = 'CONFIRMING',
  /** OR — first enabled strategy with a signal fires (more entries). */
  ANY = 'ANY',
}

export enum BotDirection {
  CALL = 'CALL',
  PUT = 'PUT',
}
