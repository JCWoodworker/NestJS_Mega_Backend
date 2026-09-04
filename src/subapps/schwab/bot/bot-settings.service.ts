import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { BotEventService } from './bot-event.service';
import {
  buildSuggestedSettings,
  SuggestedSettingsResult,
} from './bot-suggested-settings.util';
import { UpdateBotSettingsDto } from './dto/update-bot-settings.dto';
import { BotSettings } from './entities/bot-settings.entity';
import { BotEventType } from './enums/bot-event-type.enum';
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
    private readonly botEventService: BotEventService,
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

  /** Fee/math-aware recommended settings for the given equity. */
  async getSuggested(equity: number): Promise<SuggestedSettingsResult> {
    const current = await this.getSettings();
    return buildSuggestedSettings(Math.max(0, equity), current);
  }

  async updateSettings(patch: UpdateBotSettingsDto): Promise<BotSettingsView> {
    const row = await this.getRow();
    const before = this.toView(row);
    // Contract view fields / frontend aliases aren't columns themselves —
    // strip them before Object.assign, then translate onto the entity.
    const {
      strategiesEnabled,
      directionsEnabled,
      profitTargetUsd,
      profitTargetPctDayStart,
      profitTargetPctCurrent,
      ...rest
    } = patch;
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
    // Frontend often PUTs both `profitTarget*` (form) and `profit*` (GET echo).
    // When the alias is present it wins, so a form value of 50 isn't wiped by
    // a null GET-shaped `profitUsd` in the same body.
    if (profitTargetUsd !== undefined) {
      row.profitUsd = profitTargetUsd;
    }
    if (profitTargetPctDayStart !== undefined) {
      row.profitPctDayStart = profitTargetPctDayStart;
    }
    if (profitTargetPctCurrent !== undefined) {
      row.profitPctCurrent = profitTargetPctCurrent;
    }
    const saved = await this.settingsRepository.save(row);
    const after = this.toView(saved);
    await this.botEventService.record({
      lane: null,
      type: BotEventType.OPERATOR_SETTINGS,
      reason: 'SETTINGS_UPDATED',
      payload: { before, after, patch },
    });
    return after;
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
