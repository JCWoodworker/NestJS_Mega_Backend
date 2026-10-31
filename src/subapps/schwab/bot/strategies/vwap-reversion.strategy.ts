import { computeSessionTypicalVwap } from '../bot-strategy.util';
import { BotStrategy } from '../enums/strategy.enum';
import { StrategyDefinition } from './strategy.types';

/**
 * How many ATRs past session VWAP counts as stretched. Practitioners often
 * wait for ~2 ATR on liquid names; 1 ATR on 15-second SPXW bars fired too
 * often and lost against the session trend gate.
 */
const STRETCH_ATR = 1.5;

/**
 * Fade a move stretched beyond VWAP back toward it. The counterpart of the
 * continuation pullback, and only meaningful on a real session VWAP.
 */
export const vwapReversionStrategy: StrategyDefinition = {
  id: BotStrategy.VWAP_REVERSION,
  needs: ['vwap', 'atr'],
  defaultEnabled: false,
  evaluate(ctx) {
    if (ctx.atr == null || ctx.atr <= 0) return null;
    if (ctx.candles.length < 2) return null;
    const anchor =
      computeSessionTypicalVwap(ctx.candles, ctx.sessionStartMs) ?? ctx.vwap;
    if (anchor == null) return null;
    const last = ctx.candles[ctx.candles.length - 1];
    const prev = ctx.candles[ctx.candles.length - 2];
    const stretch = ctx.atr * STRETCH_ATR;
    /** Stretch on declining participation is more often exhaustion, not trend. */
    const fadingParticipation = last.volume <= prev.volume;
    if (
      fadingParticipation &&
      last.close < anchor - stretch &&
      last.close > prev.close
    ) {
      return 'CALL';
    }
    if (
      fadingParticipation &&
      last.close > anchor + stretch &&
      last.close < prev.close
    ) {
      return 'PUT';
    }
    return null;
  },
};
