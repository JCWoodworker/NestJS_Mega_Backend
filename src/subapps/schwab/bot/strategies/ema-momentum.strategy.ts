import { BotStrategy } from '../enums/strategy.enum';
import { StrategyDefinition } from './strategy.types';

/**
 * Afternoon trend rule: fast EMA above slow EMA, price above the fast EMA,
 * and the last bar still pushing that way. The reverse for puts.
 */
/** Skip tangled EMAs — chop reads as momentum on 15-second bars. */
const MIN_EMA_SPREAD_ATR = 0.12;

export const emaMomentumStrategy: StrategyDefinition = {
  id: BotStrategy.EMA_MOMENTUM,
  needs: ['ema', 'atr'],
  defaultEnabled: false,
  evaluate(ctx) {
    if (ctx.emaFast == null || ctx.emaSlow == null) return null;
    if (ctx.atr == null || ctx.atr <= 0) return null;
    if (Math.abs(ctx.emaFast - ctx.emaSlow) < ctx.atr * MIN_EMA_SPREAD_ATR) {
      return null;
    }
    if (ctx.candles.length < 2) return null;
    const last = ctx.candles[ctx.candles.length - 1];
    const prev = ctx.candles[ctx.candles.length - 2];
    if (
      ctx.emaFast > ctx.emaSlow &&
      last.close > ctx.emaFast &&
      last.close > prev.close
    ) {
      return 'CALL';
    }
    if (
      ctx.emaFast < ctx.emaSlow &&
      last.close < ctx.emaFast &&
      last.close < prev.close
    ) {
      return 'PUT';
    }
    return null;
  },
};
