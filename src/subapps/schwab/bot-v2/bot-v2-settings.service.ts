import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { BotSettingsService } from '@schwab/bot/bot-settings.service';
import { requireUserId } from '@schwab/shared/schwab-user-context';

import { BotV2Settings } from './entities/bot-v2-settings.entity';
import { isSignalBarSeconds } from './bot-v2-bars.util';
import { isBotV2Underlying } from './bot-v2-config.util';

@Injectable()
export class BotV2SettingsService {
  constructor(
    @InjectRepository(BotV2Settings)
    private readonly settings: Repository<BotV2Settings>,
    private readonly championSettings: BotSettingsService,
  ) {}

  async get(userId = requireUserId()): Promise<BotV2Settings> {
    const existing = await this.settings.findOneBy({ userId });
    const row =
      existing ??
      (await this.settings.save(
        this.settings.create({
          userId,
          useRiskAtStop: false,
          maxRiskUsd: 200,
          signalBarSeconds: 60,
          useScaleOut: false,
          botUnderlying: 'SPY',
          trailArmPct: 8,
          trailPct: 15,
          trailMinLockPct: 5,
        }),
      ));
    if (row.seededFromChampion) return row;
    return this.seedFromChampion(row, userId);
  }

  /** One copy of the live champion knobs. New flags stay off. */
  private async seedFromChampion(
    row: BotV2Settings,
    userId: string,
  ): Promise<BotV2Settings> {
    const champion = await this.championSettings.getRow(userId);
    const num = (value: unknown, fallback: number) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    };
    row.strategiesEnabled = champion.strategiesEnabled;
    row.minStrategyAgreement = champion.minStrategyAgreement;
    row.callsEnabled = champion.callsEnabled;
    row.putsEnabled = champion.putsEnabled;
    row.canBuyCalls = champion.canBuyCalls;
    row.canBuyPuts = champion.canBuyPuts;
    row.combineMode = champion.combineMode;
    row.riskPct = num(champion.riskPct, 10);
    row.minPremium = num(champion.minPremium, 0.6);
    row.maxPremium = num(champion.maxPremium, 2.5);
    row.maxSpreadPct = num(champion.maxSpreadPct, 5);
    row.deltaMin = num(champion.deltaMin, 0.4);
    row.deltaMax = num(champion.deltaMax, 0.6);
    row.tradeWindowStart = champion.tradeWindowStart;
    row.tradeWindowEnd = champion.tradeWindowEnd;
    row.hardFlattenTime = champion.hardFlattenTime;
    row.cooldownMins = champion.cooldownMins;
    row.atrPeriod = champion.atrPeriod;
    row.usePremiumStop = champion.usePremiumStop;
    row.premiumStopPct = num(champion.premiumStopPct, 25);
    row.usePremiumTarget = champion.usePremiumTarget;
    row.premiumTargetPct = num(champion.premiumTargetPct, 22);
    row.useTrailStop = champion.useTrailStop;
    row.stopAtrMult = num(champion.stopAtrMult, 1.5);
    row.targetAtrMult = num(champion.targetAtrMult, 1.8);
    row.paperSlippageCents = champion.paperSlippageCents;
    const arm = num(champion.trailArmPct, 8);
    const lock = num(champion.trailMinLockPct, 5);
    const giveback = num(champion.trailPct, 15);
    if (lock < arm) {
      row.trailArmPct = arm;
      row.trailMinLockPct = lock;
      row.trailPct = giveback;
    }
    row.useRiskAtStop = false;
    row.useScaleOut = false;
    row.signalBarSeconds = 60;
    row.botUnderlying = 'SPY';
    row.seededFromChampion = true;
    return this.settings.save(row);
  }

  async update(
    patch: Partial<BotV2Settings>,
    userId = requireUserId(),
  ): Promise<BotV2Settings> {
    const row = await this.get(userId);
    if (patch.botUnderlying != null && !isBotV2Underlying(String(patch.botUnderlying))) {
      throw new BadRequestException('FUTURES_QUOTE_UNAVAILABLE');
    }
    if (
      patch.signalBarSeconds != null &&
      !isSignalBarSeconds(Number(patch.signalBarSeconds))
    ) {
      throw new BadRequestException('SIGNAL_BAR_SECONDS');
    }
    if (patch.useRiskAtStop && !(Number(patch.maxRiskUsd ?? row.maxRiskUsd) > 0)) {
      throw new BadRequestException('MAX_RISK_USD');
    }
    const arm = Number(patch.trailArmPct ?? row.trailArmPct);
    const lock = Number(patch.trailMinLockPct ?? row.trailMinLockPct);
    if (lock >= arm) {
      throw new BadRequestException('LOCK_MUST_BE_BELOW_ARM');
    }
    Object.assign(row, patch);
    return this.settings.save(row);
  }

  /** Shape the existing desk settings form already edits. */
  toDeskView(row: BotV2Settings) {
    const num = (value: unknown) => Number(value);
    const directions = [
      ...(row.callsEnabled ? (['CALL'] as const) : []),
      ...(row.putsEnabled ? (['PUT'] as const) : []),
    ];
    return {
      strategiesEnabled: row.strategiesEnabled,
      combineMode: row.combineMode,
      directionsEnabled: directions,
      canBuyCalls: row.canBuyCalls,
      canBuyPuts: row.canBuyPuts,
      riskPct: num(row.riskPct),
      useMaxLossUsd: false,
      maxLossUsd: null,
      useMaxLossPct: false,
      maxLossPct: null,
      useProfitUsd: false,
      profitUsd: null,
      profitPctDayStart: null,
      profitPctCurrent: null,
      useProfitPctDayStart: false,
      useProfitPctCurrent: false,
      minPremium: num(row.minPremium),
      maxPremium: num(row.maxPremium),
      maxSpreadPct: num(row.maxSpreadPct),
      deltaMin: num(row.deltaMin),
      deltaMax: num(row.deltaMax),
      tradeWindowStart: row.tradeWindowStart,
      tradeWindowEnd: row.tradeWindowEnd,
      hardFlattenTime: row.hardFlattenTime,
      cooldownMins: row.cooldownMins,
      atrPeriod: row.atrPeriod,
      usePremiumStop: row.usePremiumStop,
      premiumStopPct: num(row.premiumStopPct),
      usePremiumTarget: row.usePremiumTarget,
      premiumTargetPct: num(row.premiumTargetPct),
      useTrailStop: row.useTrailStop,
      trailArmPct: num(row.trailArmPct),
      trailPct: num(row.trailPct),
      trailMinLockPct: num(row.trailMinLockPct),
      stopAtrMult: num(row.stopAtrMult),
      targetAtrMult: num(row.targetAtrMult),
      paperSlippageCents: row.paperSlippageCents,
      useRiskAtStop: row.useRiskAtStop,
      maxRiskUsd: num(row.maxRiskUsd),
      signalBarSeconds: row.signalBarSeconds,
      useScaleOut: row.useScaleOut,
      botUnderlying: row.botUnderlying,
      useTimeStop: row.useTimeStop,
      timeStopSeconds: row.timeStopSeconds,
    };
  }
}
