import {
  computeAtr,
  computeEma,
  computeOrbRange,
  computeVwap,
  type BotCandle,
  type BotStrategyId,
} from '../bot-strategy.util';
import { BotStrategy } from '../enums/strategy.enum';
import { emaMomentumStrategy } from './ema-momentum.strategy';
import { orb5mStrategy } from './orb-5m.strategy';
import { orbRetestStrategy } from './orb-retest.strategy';
import { rangeFadeStrategy } from './range-fade.strategy';
import {
  StrategyContext,
  StrategyDefinition,
  StrategyNeed,
} from './strategy.types';
import { vwapPullbackStrategy } from './vwap-pullback.strategy';
import { vwapReversionStrategy } from './vwap-reversion.strategy';
import { vwapRolling100Strategy } from './vwap-rolling-100.strategy';

export const EMA_FAST_PERIOD = 9;
export const EMA_SLOW_PERIOD = 21;

export const STRATEGY_REGISTRY: StrategyDefinition[] = [
  vwapPullbackStrategy,
  orb5mStrategy,
  vwapRolling100Strategy,
  vwapReversionStrategy,
  orbRetestStrategy,
  emaMomentumStrategy,
  rangeFadeStrategy,
];

const BY_ID = new Map(STRATEGY_REGISTRY.map((strategy) => [strategy.id, strategy]));

export function strategyById(id: BotStrategy): StrategyDefinition | undefined {
  return BY_ID.get(id);
}

export function defaultEnabledStrategies(): BotStrategy[] {
  return STRATEGY_REGISTRY.filter((strategy) => strategy.defaultEnabled).map(
    (strategy) => strategy.id,
  );
}

export function buildStrategyContext(
  candles: BotCandle[],
  sessionStartMs: number,
  atrPeriod: number,
  needs: StrategyNeed[] = ['vwap', 'atr', 'orb', 'ema'],
): StrategyContext {
  return {
    candles,
    sessionStartMs,
    vwap: needs.includes('vwap') ? computeVwap(candles, sessionStartMs) : null,
    atr: needs.includes('atr') ? computeAtr(candles, atrPeriod) : null,
    orb: needs.includes('orb') ? computeOrbRange(candles, sessionStartMs) : null,
    emaFast: needs.includes('ema') ? computeEma(candles, EMA_FAST_PERIOD) : null,
    emaSlow: needs.includes('ema') ? computeEma(candles, EMA_SLOW_PERIOD) : null,
  };
}

export function evaluateEnabled(
  enabled: readonly BotStrategyId[],
  ctx: StrategyContext,
): Partial<Record<BotStrategyId, 'CALL' | 'PUT' | null>> {
  const results: Partial<Record<BotStrategyId, 'CALL' | 'PUT' | null>> = {};
  for (const id of enabled) {
    const strategy = BY_ID.get(id as BotStrategy);
    if (!strategy) continue;
    results[id] = strategy.evaluate(ctx);
  }
  return results;
}
