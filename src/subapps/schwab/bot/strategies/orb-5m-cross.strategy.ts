import { etHhMmFromMs, evaluateOrb5mCrossover } from '../bot-strategy.util';
import { BotStrategy } from '../enums/strategy.enum';
import { StrategyDefinition } from './strategy.types';

/** First ORB cross right after the 5-minute range often fails in the open spike. */
const ORB_CROSS_EARLIEST = '09:45';

export const orb5mCrossStrategy: StrategyDefinition = {
  id: BotStrategy.ORB_5M_CROSS,
  needs: ['orb'],
  defaultEnabled: false,
  evaluate(ctx) {
    if (!ctx.candles.length) return null;
    const last = ctx.candles[ctx.candles.length - 1];
    if (etHhMmFromMs(last.chartTime) < ORB_CROSS_EARLIEST) return null;
    return evaluateOrb5mCrossover(ctx.candles, ctx.orb);
  },
};
