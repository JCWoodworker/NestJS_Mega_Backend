import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UpdateBotSettingsDto } from './dto/update-bot-settings.dto';
import { BotSettings } from './entities/bot-settings.entity';
import {
  BotCombineMode,
  BotDirection,
  BotStrategy,
} from './enums/strategy.enum';

export interface BotSettingsView {
  strategiesEnabled: BotStrategy[];
  /** Operator preference — which directions the bot may enter. Default `['CALL']`. */
  directionsEnabled: BotDirection[];
  /** Operator-declared account capability (not live-verified against Schwab). */
  canBuyCalls: boolean;
  canBuyPuts: boolean;
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
  /** Guards the lazy-create-on-first-read below against a boot-time race
   * where two concurrent callers both see no row and both insert one —
   * observed in practice (duplicate `bot_state` rows on first deploy). */
  private creatingRow: Promise<BotSettings> | null = null;

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

    if (!this.creatingRow) {
      this.creatingRow = this.settingsRepository
        .save(this.settingsRepository.create({}))
        .finally(() => {
          this.creatingRow = null;
        });
    }
    return this.creatingRow;
  }

  async getSettings(): Promise<BotSettingsView> {
    return this.toView(await this.getRow());
  }

  async updateSettings(patch: UpdateBotSettingsDto): Promise<BotSettingsView> {
    const row = await this.getRow();
    // `strategiesEnabled` / `directionsEnabled` (contract §14b) aren't columns
    // themselves — they're views over boolean flags, so translate them before
    // assigning the rest of the patch directly onto the entity.
    const { strategiesEnabled, directionsEnabled, ...rest } = patch;
    Object.assign(row, rest);
    if (strategiesEnabled) {
      row.vwapPullbackEnabled = strategiesEnabled.includes(
        BotStrategy.VWAP_PULLBACK,
      );
      row.orb5mEnabled = strategiesEnabled.includes(BotStrategy.ORB_5M);
    }
    if (directionsEnabled) {
      row.callsEnabled = directionsEnabled.includes(BotDirection.CALL);
      row.putsEnabled = directionsEnabled.includes(BotDirection.PUT);
    }
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
    const directionsEnabled: BotDirection[] = [];
    if (row.callsEnabled) {
      directionsEnabled.push(BotDirection.CALL);
    }
    if (row.putsEnabled) {
      directionsEnabled.push(BotDirection.PUT);
    }
    return {
      strategiesEnabled,
      directionsEnabled,
      canBuyCalls: row.canBuyCalls,
      canBuyPuts: row.canBuyPuts,
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
