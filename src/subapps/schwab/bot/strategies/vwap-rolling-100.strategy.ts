import {
  computeVwap,
  evaluateVwapPullback,
} from '../bot-strategy.util';
import { BotStrategy } from '../enums/strategy.enum';
import { StrategyDefinition } from './strategy.types';

/** Bars in the accidental rolling window the bot used to run after 11:10. */
export const ROLLING_VWAP_BARS = 100;

/**
 * Same pullback rule as VWAP_PULLBACK, but the average is only the last 100
 * bars. This is the behaviour the 100-bar ring produced once the open aged
 * out. It ships off so the designed session VWAP is what runs by default.
 */
export const vwapRolling100Strategy: StrategyDefinition = {
  id: BotStrategy.VWAP_ROLLING_100,
  needs: ['atr'],
  defaultEnabled: false,
  evaluate(ctx) {
    const window = ctx.candles.slice(-ROLLING_VWAP_BARS);
    if (window.length < 2) return null;
    const vwap = computeVwap(window, window[0].chartTime);
    return evaluateVwapPullback(window, vwap, ctx.atr);
  },
};
