import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { requireUserId } from '@schwab/shared/schwab-user-context';

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
  usePremiumStop: boolean;
  premiumStopPct: number;
  usePremiumTarget: boolean;
  premiumTargetPct: number;
  useTrailStop: boolean;
  trailArmPct: number;
  trailPct: number;
  trailMinLockPct: number;
  stopAtrMult: number;
  targetAtrMult: number;
  paperSlippageCents: number;
}

@Injectable()
export class BotSettingsService {
  /** Guards the lazy-create-on-first-read below against a boot-time race
   * where two concurrent callers both see no row and both insert one —
   * observed in practice (duplicate `bot_state` rows on first deploy).
   * Keyed by user so one user's insert cannot satisfy another's read. */
  private readonly creatingRows = new Map<string, Promise<BotSettings>>();

  constructor(
    @InjectRepository(BotSettings)
    private readonly settingsRepository: Repository<BotSettings>,
    private readonly botEventService: BotEventService,
  ) {}

  async getRow(userId = requireUserId()): Promise<BotSettings> {
    const existing = await this.settingsRepository.findOneBy({ userId });
    if (existing) return existing;

    const inFlight = this.creatingRows.get(userId);
    if (inFlight) return inFlight;

    const creating = this.settingsRepository
      .save(this.settingsRepository.create({ userId }))
      .finally(() => {
        this.creatingRows.delete(userId);
      });
    this.creatingRows.set(userId, creating);
    return creating;
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

    // Cross-field: a min-lock at or above the arm threshold asks to bank more
    // profit than the trade has made, which would place the stop above the
    // market and fire on the arming tick. Checked against the merged row
    // because PUT accepts partial patches — a body with only trailMinLockPct
    // never presents trailArmPct for a DTO-level comparison.
    const arm = Number(row.trailArmPct);
    const minLock = Number(row.trailMinLockPct);
    if (Number.isFinite(arm) && Number.isFinite(minLock) && minLock >= arm) {
      throw new BadRequestException(
        `trailMinLockPct (${minLock}) must be strictly less than trailArmPct (${arm}) — otherwise the trail arms into a stop above the market and exits immediately`,
      );
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
      usePremiumStop: row.usePremiumStop,
      premiumStopPct: Number(row.premiumStopPct),
      usePremiumTarget: row.usePremiumTarget,
      premiumTargetPct: Number(row.premiumTargetPct),
      useTrailStop: row.useTrailStop,
      trailArmPct: Number(row.trailArmPct),
      trailPct: Number(row.trailPct),
      trailMinLockPct: Number(row.trailMinLockPct),
      stopAtrMult: Number(row.stopAtrMult),
      targetAtrMult: Number(row.targetAtrMult),
      paperSlippageCents: row.paperSlippageCents,
    };
  }
}
