export enum BotStrategy {
  VWAP_PULLBACK = 'VWAP_PULLBACK',
  ORB_5M = 'ORB_5M',
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
