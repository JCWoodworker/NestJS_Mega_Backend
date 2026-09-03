import { BotPhase } from './enums/bot-event-type.enum';
import { BotLane } from './enums/bot-lane.enum';
import { BotMode } from './enums/bot-mode.enum';

export interface ComputePhaseParams {
  mode: BotMode;
  lane: BotLane | null;
  lockout: boolean;
  hasOpenPosition: boolean;
  /** Set by the engine while a walk-limit entry/exit is actively in flight —
   * takes priority over the static state-derived phase below. */
  transientPhase: 'ENTERING' | 'EXITING' | null;
  withinTradeWindow: boolean;
  inCooldown: boolean;
}

/** Pure state → `BotPhase` mapping (frontend contract §14j) — kept outside
 * BotStateService/BotEngineService so the state machine itself is testable
 * without spinning up either service. */
export function computePhase(params: ComputePhaseParams): BotPhase {
  if (params.lockout) return 'LOCKOUT';
  if (params.mode !== BotMode.BOT || !params.lane) return 'STOPPED';
  if (params.transientPhase === 'ENTERING') return 'ENTERING';
  if (params.transientPhase === 'EXITING') return 'EXITING';
  if (params.hasOpenPosition) return 'IN_POSITION';
  if (!params.withinTradeWindow) return 'WAITING_WINDOW';
  if (params.inCooldown) return 'COOLDOWN';
  return 'SCANNING';
}
