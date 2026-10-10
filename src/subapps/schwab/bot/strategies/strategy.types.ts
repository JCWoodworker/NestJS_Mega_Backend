import { BotStrategy } from '../enums/strategy.enum';
import {
  BotCandle,
  OrbRange,
  SignalDirection,
} from '../bot-strategy.util';

export type StrategyNeed = 'vwap' | 'atr' | 'orb' | 'ema';

export interface StrategyContext {
  candles: BotCandle[];
  sessionStartMs: number;
  vwap: number | null;
  /**
   * Session VWAP from 1-minute bars when the engine supplies it. Fade rules
   * should anchor here; signal-bar VWAP on 15-second prints is too twitchy.
   */
  sessionVwap?: number | null;
  atr: number | null;
  orb: OrbRange | null;
  emaFast: number | null;
  emaSlow: number | null;
}

export interface StrategyDefinition {
  id: BotStrategy;
  /** Indicators the engine must compute before evaluating. */
  needs: StrategyNeed[];
  evaluate(ctx: StrategyContext): SignalDirection | null;
  /** New rules ship disabled; enabling one is a deliberate act. */
  defaultEnabled: boolean;
}
