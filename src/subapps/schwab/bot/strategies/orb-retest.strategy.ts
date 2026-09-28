import { BotStrategy } from '../enums/strategy.enum';
import { StrategyDefinition } from './strategy.types';

/**
 * Enter on a pullback to a broken opening-range level, not on the break.
 * The prior bar must have closed outside; this bar must tag the level and
 * close back outside it.
 */
export const orbRetestStrategy: StrategyDefinition = {
  id: BotStrategy.ORB_RETEST,
  needs: ['orb'],
  defaultEnabled: false,
  evaluate(ctx) {
    if (!ctx.orb || ctx.candles.length < 2) return null;
    const last = ctx.candles[ctx.candles.length - 1];
    const prev = ctx.candles[ctx.candles.length - 2];
    const band = Math.max(0.05, (ctx.orb.high - ctx.orb.low) * 0.15);
    if (
      prev.close > ctx.orb.high &&
      last.low <= ctx.orb.high + band &&
      last.close >= ctx.orb.high
    ) {
      return 'CALL';
    }
    if (
      prev.close < ctx.orb.low &&
      last.high >= ctx.orb.low - band &&
      last.close <= ctx.orb.low
    ) {
      return 'PUT';
    }
    return null;
  },
};
