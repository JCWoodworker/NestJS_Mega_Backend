import { etHhMmFromMs } from '../bot-strategy.util';
import { BotStrategy } from '../enums/strategy.enum';
import { StrategyDefinition } from './strategy.types';

/** Momentum continuation lacks follow-through when lunch liquidity thins. */
const MOMO_LUNCH_START = '11:30';
const MOMO_LUNCH_END = '13:00';
/** Late-day 0DTE call momentum fights pin and accelerating theta. */
const MOMO_LATE_CALL_START = '14:00';
const MOMO_LATE_CALL_END = '14:45';

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
    if (hhmm >= MOMO_LUNCH_START && hhmm < MOMO_LUNCH_END) return null;
    const prev = ctx.candles[ctx.candles.length - 2];
    if (
      ctx.emaFast > ctx.emaSlow &&
      last.close > ctx.emaFast &&
      last.close > prev.close
    ) {
      if (hhmm >= MOMO_LATE_CALL_START && hhmm < MOMO_LATE_CALL_END) return null;
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
