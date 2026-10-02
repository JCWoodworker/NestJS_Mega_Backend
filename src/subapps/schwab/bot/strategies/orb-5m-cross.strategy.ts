import { evaluateOrb5mCrossover } from '../bot-strategy.util';
import { BotStrategy } from '../enums/strategy.enum';
import { StrategyDefinition } from './strategy.types';

export const orb5mCrossStrategy: StrategyDefinition = {
  id: BotStrategy.ORB_5M_CROSS,
  needs: ['orb'],
  defaultEnabled: false,
  evaluate(ctx) {
    return evaluateOrb5mCrossover(ctx.candles, ctx.orb);
  },
};
