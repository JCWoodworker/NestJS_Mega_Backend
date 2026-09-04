import {
  buildSuggestedSettings,
  classifySettingsTier,
} from './bot-suggested-settings.util';
import {
  BotCombineMode,
  BotDirection,
  BotStrategy,
} from './enums/strategy.enum';

function baseSettings(overrides: Record<string, unknown> = {}) {
  return {
    strategiesEnabled: [BotStrategy.VWAP_PULLBACK, BotStrategy.ORB_5M],
    directionsEnabled: [BotDirection.CALL],
    canBuyCalls: true,
    canBuyPuts: false,
    combineMode: BotCombineMode.CONFIRMING,
    riskPct: 100,
    useMaxLossUsd: true,
    maxLossUsd: 50,
    useMaxLossPct: false,
    maxLossPct: null,
    useProfitUsd: false,
    profitUsd: 50,
    useProfitPctDayStart: false,
    profitPctDayStart: 10,
    useProfitPctCurrent: false,
    profitPctCurrent: null,
    minPremium: 0.08,
    maxPremium: 1,
    maxSpreadPct: 10,
    deltaMin: 0.4,
    deltaMax: 0.6,
    tradeWindowStart: '09:30',
    tradeWindowEnd: '15:00',
    hardFlattenTime: '15:30',
    cooldownMins: 0,
    atrPeriod: 14,
    paperSlippageCents: 1,
    ...overrides,
  } as any;
}

describe('classifySettingsTier', () => {
  it('maps equity bands', () => {
    expect(classifySettingsTier(110)).toBe('MICRO');
    expect(classifySettingsTier(500)).toBe('SMALL');
    expect(classifySettingsTier(1999)).toBe('SMALL');
    expect(classifySettingsTier(2000)).toBe('STANDARD');
    expect(classifySettingsTier(5000)).toBe('COMFORTABLE');
  });
});

describe('buildSuggestedSettings', () => {
  it('MICRO: single strategy, riskPct < 100, no PUT when canBuyPuts false', () => {
    const result = buildSuggestedSettings(110, baseSettings());
    expect(result.tier).toBe('MICRO');
    expect(result.suggested.strategiesEnabled).toEqual([
      BotStrategy.VWAP_PULLBACK,
    ]);
    expect(result.suggested.riskPct).toBeLessThan(100);
    expect(result.suggested.directionsEnabled).toEqual([BotDirection.CALL]);
    expect(result.suggested.directionsEnabled).not.toContain(BotDirection.PUT);
    expect(result.patch.riskPct).toBeDefined();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('STANDARD at $3k uses dual strategies and higher minPremium', () => {
    const result = buildSuggestedSettings(3000, baseSettings());
    expect(result.tier).toBe('STANDARD');
    expect(result.suggested.strategiesEnabled).toEqual([
      BotStrategy.VWAP_PULLBACK,
      BotStrategy.ORB_5M,
    ]);
    expect(result.suggested.minPremium).toBeGreaterThanOrEqual(1);
  });

  it('includes PUT when canBuyPuts is true', () => {
    const result = buildSuggestedSettings(
      110,
      baseSettings({ canBuyPuts: true }),
    );
    expect(result.suggested.directionsEnabled).toContain(BotDirection.PUT);
  });
});
