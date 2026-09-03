/** Activity feed event types — frontend contract §14j (live watch). */
export enum BotEventType {
  SIGNAL = 'SIGNAL',
  SKIP = 'SKIP',
  ENTRY_SUBMIT = 'ENTRY_SUBMIT',
  ENTRY_FILL = 'ENTRY_FILL',
  EXIT_SUBMIT = 'EXIT_SUBMIT',
  EXIT_FILL = 'EXIT_FILL',
  FLAT_KILL = 'FLAT_KILL',
  LOCKOUT = 'LOCKOUT',
  UNLOCK = 'UNLOCK',
  PHASE = 'PHASE',
}

export type BotEventSide = 'BUY' | 'SELL';

/** Bot run-state phase — frontend contract §14j. */
export type BotPhase =
  | 'STOPPED'
  | 'LOCKOUT'
  | 'WAITING_WINDOW'
  | 'SCANNING'
  | 'ENTERING'
  | 'IN_POSITION'
  | 'EXITING'
  | 'COOLDOWN';
