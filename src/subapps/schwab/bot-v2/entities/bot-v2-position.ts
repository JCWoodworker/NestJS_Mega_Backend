import { StopPremiumSource } from '@schwab/bot/bot-exit.util';
import { BotDirection } from '@schwab/bot/enums/strategy.enum';

import { SignalBarSeconds } from '../bot-v2-bars.util';
import { BotV2Underlying } from '../bot-v2-config.util';

export interface BotV2OpenPosition {
  positionId: string;
  symbol: string;
  underlying: BotV2Underlying;
  direction: BotDirection;
  /** Contracts still open. */
  quantity: number;
  originalQuantity: number;
  entryPrice: number;
  openedAt: number;
  entryUnderlying: number | null;
  stopUnderlying: number | null;
  targetUnderlying: number | null;
  stopPremium: number | null;
  targetPremium: number | null;
  initialStopPremium: number | null;
  peakBid: number | null;
  trailArmed: boolean;
  stopPremiumSource: StopPremiumSource;
  atrUsed: number | null;
  scaledOut: boolean;
  signalBarSeconds: SignalBarSeconds;
  configVersion: string;
}
