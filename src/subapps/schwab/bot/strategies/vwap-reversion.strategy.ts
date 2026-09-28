import { BotStrategy } from '../enums/strategy.enum';
import { StrategyDefinition } from './strategy.types';

/** How many ATRs past session VWAP counts as stretched. */
const STRETCH_ATR = 1;

/**
 * Fade a move stretched beyond VWAP back toward it. The counterpart of the
 * continuation pullback, and only meaningful on a real session VWAP.
 */
export const vwapReversionStrategy: StrategyDefinition = {
  id: BotStrategy.VWAP_REVERSION,
  needs: ['vwap', 'atr'],
  defaultEnabled: false,
  evaluate(ctx) {
    if (ctx.vwap == null || ctx.atr == null || ctx.atr <= 0) return null;
    if (ctx.candles.length < 2) return null;
    const last = ctx.candles[ctx.candles.length - 1];
    const prev = ctx.candles[ctx.candles.length - 2];
    const stretch = ctx.atr * STRETCH_ATR;
    if (last.close < ctx.vwap - stretch && last.close > prev.close) {
      return 'CALL';
    }
    if (last.close > ctx.vwap + stretch && last.close < prev.close) {
      return 'PUT';
    }
    return null;
  },
};
