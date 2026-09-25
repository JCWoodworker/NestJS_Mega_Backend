import { MIN_EQUITY_LIVE } from './bot-equity-thresholds.const';
import { BotSettingsView } from './bot-settings.service';
import { BotSettingsTier } from './enums/bot-event-type.enum';
import {
  BotCombineMode,
  BotDirection,
  BotStrategy,
} from './enums/strategy.enum';

export interface SuggestedSettingsResult {
  equity: number;
  tier: BotSettingsTier;
  /** True when equity meets the BOT_LIVE floor ($5,000). */
  liveEligible: boolean;
  suggested: BotSettingsView;
  patch: Partial<BotSettingsView>;
  rationale: string[];
  warnings: string[];
}

export function classifySettingsTier(equity: number): BotSettingsTier {
  if (equity < 500) return 'MICRO';
  if (equity < 2000) return 'SMALL';
  if (equity < 5000) return 'STANDARD';
  return 'COMFORTABLE';
}

/**
 * Fee/math-aware recommended settings for the given equity + capability.
 *
 * 2026-09-25 fast-scalp bias (Apply suggested is the only operator path):
 * - Lower premium targets (~18–22%) so small bumps are taken instead of
 *   waiting on a lofty 40% that rarely prints on VWAP/ORB chop.
 * - Restore trail arm to the original ~+20% design (MICRO +15) so a brief
 *   +10% wick cannot lock a permanent floor. Min-lock is breakeven-only (0)
 *   so arming does not choke small scalps.
 * - Short cooldown (2m) so a run can be re-entered after a quick scalp.
 * - Slightly tighter ATR target mult for faster underlying exits.
 *
 * James only taps Apply suggested — these values are the live SoT for
 * sessions once he re-applies after deploy.
 */
export function buildSuggestedSettings(
  equity: number,
  current: BotSettingsView,
): SuggestedSettingsResult {
  const tier = classifySettingsTier(equity);
  const liveEligible = equity >= MIN_EQUITY_LIVE;
  const rationale: string[] = [];
  const warnings: string[] = [];

  const suggested: BotSettingsView = { ...current };

  suggested.combineMode = BotCombineMode.ANY;
  suggested.canBuyCalls = current.canBuyCalls;
  suggested.canBuyPuts = current.canBuyPuts;
  suggested.atrPeriod = 14;
  suggested.paperSlippageCents = current.paperSlippageCents ?? 1;
  suggested.tradeWindowStart = current.tradeWindowStart || '09:30';
  suggested.tradeWindowEnd = current.tradeWindowEnd || '15:00';
  suggested.hardFlattenTime = current.hardFlattenTime || '15:30';
  suggested.deltaMin = 0.4;
  suggested.deltaMax = 0.6;
  suggested.useMaxLossPct = false;
  suggested.maxLossPct = null;
  suggested.useProfitUsd = false;
  suggested.useProfitPctDayStart = false;
  suggested.useProfitPctCurrent = false;
  suggested.usePremiumStop = true;
  suggested.usePremiumTarget = true;
  suggested.stopAtrMult = 1.5;
  suggested.targetAtrMult = 1.8;
  // Keep trail on, but arm only after a meaningful premium gain so brief
  // wicks cannot permanently raise the floor (2026-09-23 arm-10 regression).
  suggested.useTrailStop = true;

  const directions: BotDirection[] = [];
  if (current.canBuyCalls) directions.push(BotDirection.CALL);
  if (current.canBuyPuts) directions.push(BotDirection.PUT);
  if (!directions.length) directions.push(BotDirection.CALL);
  suggested.directionsEnabled = directions;
  if (!current.canBuyPuts) {
    rationale.push(
      'Calls-only: canBuyPuts is false (declared account capability).',
    );
  }

  if (tier === 'MICRO') {
    suggested.strategiesEnabled = [
      BotStrategy.VWAP_PULLBACK,
      BotStrategy.ORB_5M,
    ];
    suggested.riskPct = 35;
    suggested.minPremium = 0.4;
    suggested.maxPremium = 1.5;
    suggested.maxSpreadPct = 8;
    suggested.cooldownMins = 2;
    suggested.useMaxLossUsd = true;
    suggested.maxLossUsd = Math.max(20, Math.round(equity * 0.3));
    suggested.profitUsd = Math.round(equity * 0.4);
    suggested.profitPctDayStart = 15;
    suggested.profitPctCurrent = null;
    suggested.premiumStopPct = 20;
    suggested.premiumTargetPct = 18;
    suggested.trailArmPct = 15;
    suggested.trailPct = 12;
    suggested.trailMinLockPct = 0;
    rationale.push(
      'MICRO (<$500): ANY combine — either VWAP or ORB can enter; fast-scalp targets (~18%) + 2m cooldown.',
    );
    rationale.push(
      `riskPct ${suggested.riskPct}% — avoid all-in on a fee-heavy micro account.`,
    );
    rationale.push(
      `maxLossUsd ~$${suggested.maxLossUsd} (~30% of equity) so one bad day cannot wipe the account.`,
    );
    warnings.push(
      'At this equity, Schwab ~$1.30/contract round-trip plus spread can be 3–8% of a 1-contract trade — expect fee drag.',
    );
    warnings.push(
      'Prefer BOT_PAPER to validate signal edge before live scalping on MICRO equity.',
    );
  } else if (tier === 'SMALL') {
    suggested.strategiesEnabled = [
      BotStrategy.VWAP_PULLBACK,
      BotStrategy.ORB_5M,
    ];
    suggested.riskPct = 20;
    suggested.minPremium = 0.6;
    suggested.maxPremium = 2.0;
    suggested.maxSpreadPct = 6;
    suggested.cooldownMins = 2;
    suggested.useMaxLossUsd = true;
    suggested.maxLossUsd = Math.round(equity * 0.25);
    suggested.profitUsd = Math.round(equity * 0.35);
    suggested.profitPctDayStart = 12;
    suggested.profitPctCurrent = null;
    suggested.premiumStopPct = 25;
    suggested.premiumTargetPct = 20;
    suggested.trailArmPct = 20;
    suggested.trailPct = 15;
    suggested.trailMinLockPct = 0;
    rationale.push(
      'SMALL ($500–$2k): dual strategies under ANY; fast-scalp premium target 20%; 2m cooldown for run re-entry.',
    );
  } else if (tier === 'STANDARD') {
    suggested.strategiesEnabled = [
      BotStrategy.VWAP_PULLBACK,
      BotStrategy.ORB_5M,
    ];
    suggested.riskPct = 12;
    suggested.minPremium = 1.0;
    suggested.maxPremium = 2.5;
    suggested.maxSpreadPct = 5;
    suggested.cooldownMins = 2;
    suggested.useMaxLossUsd = true;
    suggested.maxLossUsd = Math.round(equity * 0.2);
    suggested.profitUsd = Math.round(equity * 0.25);
    suggested.profitPctDayStart = 10;
    suggested.profitPctCurrent = null;
    suggested.premiumStopPct = 25;
    suggested.premiumTargetPct = 22;
    suggested.trailArmPct = 20;
    suggested.trailPct = 15;
    suggested.trailMinLockPct = 0;
    rationale.push(
      'STANDARD ($2k–$5k): higher minPremium so commission is a smaller % of each trade; scalp target 22%.',
    );
  } else {
    suggested.strategiesEnabled = [
      BotStrategy.VWAP_PULLBACK,
      BotStrategy.ORB_5M,
    ];
    suggested.riskPct = 10;
    suggested.minPremium = 0.6;
    suggested.maxPremium = 2.5;
    suggested.maxSpreadPct = 5;
    suggested.cooldownMins = 2;
    suggested.useMaxLossUsd = true;
    suggested.maxLossUsd = Math.round(equity * 0.15);
    suggested.profitUsd = Math.round(equity * 0.2);
    suggested.profitPctDayStart = 8;
    suggested.profitPctCurrent = null;
    suggested.premiumStopPct = 25;
    suggested.premiumTargetPct = 22;
    suggested.trailArmPct = 20;
    suggested.trailPct = 15;
    suggested.trailMinLockPct = 0;
    rationale.push(
      'COMFORTABLE (≥$5k): both strategies, ANY combine, 2m cooldown — take small bumps fast (target 22%), trail arms at +20%.',
    );
  }

  rationale.push(
    `Trail on: ${suggested.trailPct}% off peak once +${suggested.trailArmPct}% (breakeven floor only — min-lock 0) so winners cannot fully give back to the fill-time stop without choking small scalps.`,
  );
  rationale.push(
    `Fast-scalp exits: premium target ${suggested.premiumTargetPct}% / stop ${suggested.premiumStopPct}%; ATR target mult ${suggested.targetAtrMult}.`,
  );

  if (!liveEligible) {
    warnings.push(
      `Bot requires at least $${MIN_EQUITY_LIVE.toLocaleString(
        'en-US',
      )} equity for both BOT_PAPER and BOT_LIVE — raise paper capital (POST /bot/paper/reset) or fund the live account.`,
    );
  }

  rationale.push(`Tier ${tier} for equity $${equity.toFixed(2)}.`);

  const patch: Partial<BotSettingsView> = {};
  for (const key of Object.keys(suggested) as Array<keyof BotSettingsView>) {
    const a = suggested[key];
    const b = current[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      (patch as any)[key] = a;
    }
  }

  return { equity, tier, liveEligible, suggested, patch, rationale, warnings };
}
