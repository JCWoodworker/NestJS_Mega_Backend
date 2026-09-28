import { evaluateVwapPullback } from '../bot-strategy.util';
import { BotStrategy } from '../enums/strategy.enum';
import { StrategyDefinition } from './strategy.types';

export const vwapPullbackStrategy: StrategyDefinition = {
  id: BotStrategy.VWAP_PULLBACK,
  needs: ['vwap', 'atr'],
  defaultEnabled: true,
  evaluate(ctx) {
    return evaluateVwapPullback(ctx.candles, ctx.vwap, ctx.atr);
  },
};
