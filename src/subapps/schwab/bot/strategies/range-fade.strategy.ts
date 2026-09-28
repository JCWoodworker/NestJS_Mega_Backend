import { BotStrategy } from '../enums/strategy.enum';
import { StrategyDefinition } from './strategy.types';

/** A session wider than this many ATRs is a trend day, not chop. */
const TREND_RANGE_ATR = 2;
/** How close to the session extreme, as a fraction of the range, counts. */
const EXTREME_FRACTION = 0.2;

/**
 * Fade the edge of a tight session. Stays quiet once the day's range is
 * wide relative to ATR, which is the dossier's trend-vs-chop split.
 */
export const rangeFadeStrategy: StrategyDefinition = {
  id: BotStrategy.RANGE_FADE,
  needs: ['atr'],
  defaultEnabled: false,
  evaluate(ctx) {
    const session = ctx.candles.filter(
      (candle) => candle.chartTime >= ctx.sessionStartMs,
    );
    if (session.length < 6 || ctx.atr == null || ctx.atr <= 0) return null;
    let high = session[0].high;
    let low = session[0].low;
    for (const candle of session) {
      if (candle.high > high) high = candle.high;
      if (candle.low < low) low = candle.low;
    }
    const range = high - low;
    if (range <= 0 || range > ctx.atr * TREND_RANGE_ATR) return null;
    const last = session[session.length - 1];
    const prev = session[session.length - 2];
    const band = range * EXTREME_FRACTION;
    if (last.close <= low + band && last.close > prev.close) return 'CALL';
    if (last.close >= high - band && last.close < prev.close) return 'PUT';
    return null;
  },
};
