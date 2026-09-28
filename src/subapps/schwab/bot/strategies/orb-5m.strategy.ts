import { evaluateOrb5m } from '../bot-strategy.util';
import { BotStrategy } from '../enums/strategy.enum';
import { StrategyDefinition } from './strategy.types';

export const orb5mStrategy: StrategyDefinition = {
  id: BotStrategy.ORB_5M,
  needs: ['orb'],
  defaultEnabled: true,
  evaluate(ctx) {
    return evaluateOrb5m(ctx.candles, ctx.orb);
  },
};
