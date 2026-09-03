import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UpdateBotSettingsDto } from './dto/update-bot-settings.dto';
import { BotSettings } from './entities/bot-settings.entity';
import { BotCombineMode, BotStrategy } from './enums/strategy.enum';

export interface BotSettingsView {
  strategiesEnabled: BotStrategy[];
  combineMode: BotCombineMode;
  riskPct: number;
  useMaxLossUsd: boolean;
  maxLossUsd: number | null;
  useMaxLossPct: boolean;
  maxLossPct: number | null;
  useProfitUsd: boolean;
  profitUsd: number | null;
  useProfitPctDayStart: boolean;
  profitPctDayStart: number | null;
  useProfitPctCurrent: boolean;
  profitPctCurrent: number | null;
  minPremium: number;
  maxPremium: number;
  maxSpreadPct: number;
  deltaMin: number;
  deltaMax: number;
  tradeWindowStart: string;
  tradeWindowEnd: string;
  hardFlattenTime: string;
  cooldownMins: number;
  atrPeriod: number;
  paperSlippageCents: number;
}

@Injectable()
export class BotSettingsService {
  constructor(
    @InjectRepository(BotSettings)
    private readonly settingsRepository: Repository<BotSettings>,
  ) {}

  async getRow(): Promise<BotSettings> {
    const [existing] = await this.settingsRepository.find({
      take: 1,
      order: { updatedAt: 'DESC' },
    });
    if (existing) return existing;
    return this.settingsRepository.save(this.settingsRepository.create({}));
  }

  async getSettings(): Promise<BotSettingsView> {
    return this.toView(await this.getRow());
  }

  async updateSettings(patch: UpdateBotSettingsDto): Promise<BotSettingsView> {
    const row = await this.getRow();
    Object.assign(row, patch);
    const saved = await this.settingsRepository.save(row);
    return this.toView(saved);
  }

  toView(row: BotSettings): BotSettingsView {
    const strategiesEnabled: BotStrategy[] = [];
    if (row.vwapPullbackEnabled) {
      strategiesEnabled.push(BotStrategy.VWAP_PULLBACK);
    }
    if (row.orb5mEnabled) {
      strategiesEnabled.push(BotStrategy.ORB_5M);
    }
    return {
      strategiesEnabled,
      combineMode: row.combineMode,
      riskPct: Number(row.riskPct),
      useMaxLossUsd: row.useMaxLossUsd,
      maxLossUsd: row.maxLossUsd != null ? Number(row.maxLossUsd) : null,
      useMaxLossPct: row.useMaxLossPct,
      maxLossPct: row.maxLossPct != null ? Number(row.maxLossPct) : null,
      useProfitUsd: row.useProfitUsd,
      profitUsd: row.profitUsd != null ? Number(row.profitUsd) : null,
      useProfitPctDayStart: row.useProfitPctDayStart,
      profitPctDayStart:
        row.profitPctDayStart != null ? Number(row.profitPctDayStart) : null,
      useProfitPctCurrent: row.useProfitPctCurrent,
      profitPctCurrent:
        row.profitPctCurrent != null ? Number(row.profitPctCurrent) : null,
      minPremium: Number(row.minPremium),
      maxPremium: Number(row.maxPremium),
      maxSpreadPct: Number(row.maxSpreadPct),
      deltaMin: Number(row.deltaMin),
      deltaMax: Number(row.deltaMax),
      tradeWindowStart: row.tradeWindowStart,
      tradeWindowEnd: row.tradeWindowEnd,
      hardFlattenTime: row.hardFlattenTime,
      cooldownMins: row.cooldownMins,
      atrPeriod: row.atrPeriod,
      paperSlippageCents: row.paperSlippageCents,
    };
  }
}
