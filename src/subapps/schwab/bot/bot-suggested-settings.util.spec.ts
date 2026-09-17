import { MIN_EQUITY_LIVE } from './bot-equity-thresholds.const';
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
    usePremiumStop: true,
    premiumStopPct: 25,
    usePremiumTarget: true,
    premiumTargetPct: 40,
    stopAtrMult: 1.5,
    targetAtrMult: 2.5,
    paperSlippageCents: 1,
    ...overrides,
  } as any;
}

const PRACTICE_WARNING = `Bot requires at least $${MIN_EQUITY_LIVE.toLocaleString('en-US')} equity for both BOT_PAPER and BOT_LIVE — raise paper capital (POST /bot/paper/reset) or fund the live account.`;

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
  it('MICRO: dual strategies under ANY, riskPct < 100, no PUT when canBuyPuts false', () => {
    const result = buildSuggestedSettings(110, baseSettings());
    expect(result.tier).toBe('MICRO');
    expect(result.liveEligible).toBe(false);
    expect(result.suggested.strategiesEnabled).toEqual([
      BotStrategy.VWAP_PULLBACK,
      BotStrategy.ORB_5M,
    ]);
    expect(result.suggested.combineMode).toBe(BotCombineMode.ANY);
    expect(result.suggested.riskPct).toBeLessThan(100);
    expect(result.suggested.premiumStopPct).toBe(20);
    expect(result.suggested.usePremiumStop).toBe(true);
    expect(result.suggested.directionsEnabled).toEqual([BotDirection.CALL]);
    expect(result.suggested.directionsEnabled).not.toContain(BotDirection.PUT);
    expect(result.patch.riskPct).toBeDefined();
    expect(result.warnings).toContain(PRACTICE_WARNING);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('SMALL is practice-only (not liveEligible)', () => {
    const result = buildSuggestedSettings(800, baseSettings());
    expect(result.tier).toBe('SMALL');
    expect(result.liveEligible).toBe(false);
    expect(result.warnings).toContain(PRACTICE_WARNING);
  });

  it('STANDARD at $3k uses dual strategies and higher minPremium', () => {
    const result = buildSuggestedSettings(3000, baseSettings());
    expect(result.tier).toBe('STANDARD');
    expect(result.liveEligible).toBe(false);
    expect(result.suggested.strategiesEnabled).toEqual([
      BotStrategy.VWAP_PULLBACK,
      BotStrategy.ORB_5M,
    ]);
    expect(result.suggested.minPremium).toBeGreaterThanOrEqual(1);
    expect(result.warnings).toContain(PRACTICE_WARNING);
  });

  it('COMFORTABLE at $5k+ is liveEligible without the practice warning', () => {
    const result = buildSuggestedSettings(5000, baseSettings());
    expect(result.tier).toBe('COMFORTABLE');
    expect(result.liveEligible).toBe(true);
    expect(result.warnings).not.toContain(PRACTICE_WARNING);
  });

  it('includes PUT when canBuyPuts is true', () => {
    const result = buildSuggestedSettings(
      110,
      baseSettings({ canBuyPuts: true }),
    );
    expect(result.suggested.directionsEnabled).toContain(BotDirection.PUT);
  });
});
