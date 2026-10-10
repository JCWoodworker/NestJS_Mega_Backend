import { etHhMmFromMs } from '../bot-strategy.util';
import { BotStrategy } from '../enums/strategy.enum';
import { StrategyDefinition } from './strategy.types';

/** Momentum continuation lacks follow-through when lunch liquidity thins. */
const MOMO_BLACKOUT_START = '11:30';
const MOMO_BLACKOUT_END = '13:00';

/**
 * Afternoon trend rule: fast EMA above slow EMA, price above the fast EMA,
 * and the last bar still pushing that way. The reverse for puts.
 */
export const emaMomentumStrategy: StrategyDefinition = {
  id: BotStrategy.EMA_MOMENTUM,
  needs: ['ema'],
  defaultEnabled: false,
  evaluate(ctx) {
    if (ctx.emaFast == null || ctx.emaSlow == null) return null;
    if (ctx.candles.length < 2) return null;
    const last = ctx.candles[ctx.candles.length - 1];
    const hhmm = etHhMmFromMs(last.chartTime);
    if (hhmm >= MOMO_BLACKOUT_START && hhmm < MOMO_BLACKOUT_END) return null;
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
