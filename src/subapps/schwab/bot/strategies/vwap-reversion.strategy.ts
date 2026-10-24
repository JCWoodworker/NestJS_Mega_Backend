import { BotStrategy } from '../enums/strategy.enum';
import { StrategyDefinition } from './strategy.types';

/** How many ATRs past session VWAP counts as stretched. */
const STRETCH_ATR = 1;
/**
 * Skip when the session range is huge vs bar ATR (trend day). On 15s SPX bars
 * a fixed point cap mis-fires; a ratio matches dossier trend vs chop.
 */
const MAX_RANGE_TO_ATR = 10;

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
    const session = ctx.candles.filter(
      (candle) => candle.chartTime >= ctx.sessionStartMs,
    );
    if (session.length < 6) return null;
    let high = session[0].high;
    let low = session[0].low;
    for (const candle of session) {
      if (candle.high > high) high = candle.high;
      if (candle.low < low) low = candle.low;
    }
    const range = high - low;
    if (range <= 0 || range / ctx.atr > MAX_RANGE_TO_ATR) return null;
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
