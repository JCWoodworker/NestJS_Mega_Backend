/** Activity feed + decision-audit event types (frontend §14j + audit log). */
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
  /** Pre-signal gate blocked evaluation (window, cooldown, stale quote, …). */
  GATE_SKIP = 'GATE_SKIP',
  /** Strategies evaluated but CONFIRMING did not fire. */
  NO_SIGNAL = 'NO_SIGNAL',
  OPERATOR_SETTINGS = 'OPERATOR_SETTINGS',
  OPERATOR_MODE = 'OPERATOR_MODE',
  OPERATOR_LANE = 'OPERATOR_LANE',
  OPERATOR_LIVE = 'OPERATOR_LIVE',
  ERROR = 'ERROR',
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

/** Account-size tier for suggested settings. */
export type BotSettingsTier = 'MICRO' | 'SMALL' | 'STANDARD' | 'COMFORTABLE';
