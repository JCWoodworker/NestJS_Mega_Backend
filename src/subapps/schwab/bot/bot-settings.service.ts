import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { etDateKey } from '@schwab/pnl/et-date.util';
import { requireUserId } from '@schwab/shared/schwab-user-context';

import { BotEventService } from './bot-event.service';
import {
  buildSuggestedSettings,
  SuggestedSettingsResult,
} from './bot-suggested-settings.util';
import { UpdateBotSettingsDto } from './dto/update-bot-settings.dto';
import {
  BotSettingsSnapshot,
  BotSettingsSnapshotSource,
} from './entities/bot-settings-snapshot.entity';
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

export interface BotSettingsSnapshotView {
  id: string;
  at: number;
  etDateKey: string;
  source: BotSettingsSnapshotSource;
  settings: BotSettingsView;
  patch: Partial<BotSettingsView> | null;
  equity: number | null;
  tier: string | null;
}

export interface ListSettingsHistoryQuery {
  limit?: number;
  beforeAt?: number;
  from?: number;
  to?: number;
  source?: BotSettingsSnapshotSource;
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
    @InjectRepository(BotSettingsSnapshot)
    private readonly snapshotRepository: Repository<BotSettingsSnapshot>,
    private readonly botEventService: BotEventService,
  ) {}

  async getRow(userId = requireUserId()): Promise<BotSettings> {
    const existing = await this.settingsRepository.findOneBy({ userId });
    if (existing) return existing;

    const inFlight = this.creatingRows.get(userId);
    if (inFlight) return inFlight;

    const creating = this.settingsRepository
      .save(this.settingsRepository.create({ userId }))
      .then(async (row) => {
        // Baseline so rollups know what was in force before the first Apply.
        await this.recordSnapshot({
          userId,
          settings: this.toView(row),
          patch: null,
          source: BotSettingsSnapshotSource.BOOTSTRAP,
        });
        return row;
      })
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

  /**
   * Apply the full suggested patch for current equity and tag the snapshot
   * as `suggested` — James's only operator path.
   */
  async applySuggested(equity: number): Promise<{
    settings: BotSettingsView;
    suggested: SuggestedSettingsResult;
  }> {
    const suggested = await this.getSuggested(equity);
    const settings = await this.updateSettings({
      ...suggested.patch,
      source: BotSettingsSnapshotSource.SUGGESTED,
      suggestedEquity: equity,
      suggestedTier: suggested.tier,
    } as UpdateBotSettingsDto & {
      source: BotSettingsSnapshotSource;
      suggestedEquity: number;
      suggestedTier: string;
    });
    return { settings, suggested };
  }

  async updateSettings(
    patch: UpdateBotSettingsDto & {
      source?: BotSettingsSnapshotSource;
      suggestedEquity?: number;
      suggestedTier?: string;
    },
  ): Promise<BotSettingsView> {
    const userId = requireUserId();
    const row = await this.getRow(userId);
    const before = this.toView(row);
    // Contract view fields / frontend aliases aren't columns themselves —
    // strip them before Object.assign, then translate onto the entity.
    const {
      strategiesEnabled,
      directionsEnabled,
      profitTargetUsd,
      profitTargetPctDayStart,
      profitTargetPctCurrent,
      source,
      suggestedEquity,
      suggestedTier,
      ...rest
    } = patch as UpdateBotSettingsDto & {
      source?: BotSettingsSnapshotSource;
      suggestedEquity?: number;
      suggestedTier?: string;
    };
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
    const snapshotSource =
      source === BotSettingsSnapshotSource.SUGGESTED
        ? BotSettingsSnapshotSource.SUGGESTED
        : BotSettingsSnapshotSource.MANUAL;

    // Strip non-settings meta before recording patch payload.
    const {
      source: _s,
      suggestedEquity: _e,
      suggestedTier: _t,
      ...settingsPatch
    } = patch as Record<string, unknown>;

    await this.recordSnapshot({
      userId,
      settings: after,
      patch: settingsPatch as Partial<BotSettingsView>,
      source: snapshotSource,
      equity:
        suggestedEquity != null && Number.isFinite(Number(suggestedEquity))
          ? Number(suggestedEquity)
          : null,
      tier: suggestedTier ?? null,
    });

    await this.botEventService.record({
      lane: null,
      type: BotEventType.OPERATOR_SETTINGS,
      reason: 'SETTINGS_UPDATED',
      payload: {
        before,
        after,
        patch: settingsPatch,
        source: snapshotSource,
      },
    });
    return after;
  }

  async listHistory(
    query: ListSettingsHistoryQuery = {},
  ): Promise<{
    items: BotSettingsSnapshotView[];
    limit: number;
    hasMoreOlder: boolean;
  }> {
    const userId = requireUserId();
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const qb = this.snapshotRepository
      .createQueryBuilder('s')
      .where('s.user_id = :userId', { userId })
      .orderBy('s.at', 'DESC')
      .take(limit + 1);

    if (query.beforeAt != null) {
      qb.andWhere('s.at < :beforeAt', { beforeAt: String(query.beforeAt) });
    }
    if (query.from != null) {
      qb.andWhere('s.at >= :from', { from: String(query.from) });
    }
    if (query.to != null) {
      qb.andWhere('s.at <= :to', { to: String(query.to) });
    }
    if (query.source) {
      qb.andWhere('s.source = :source', { source: query.source });
    }

    const rows = await qb.getMany();
    const hasMoreOlder = rows.length > limit;
    const slice = hasMoreOlder ? rows.slice(0, limit) : rows;
    return {
      items: slice.map((r) => this.toSnapshotView(r)),
      limit,
      hasMoreOlder,
    };
  }

  private async recordSnapshot(input: {
    userId: string;
    settings: BotSettingsView;
    patch: Partial<BotSettingsView> | null;
    source: BotSettingsSnapshotSource;
    equity?: number | null;
    tier?: string | null;
  }): Promise<void> {
    const at = Date.now();
    await this.snapshotRepository.save(
      this.snapshotRepository.create({
        userId: input.userId,
        at: String(at),
        etDateKey: etDateKey(new Date(at)),
        source: input.source,
        settings: input.settings as unknown as Record<string, unknown>,
        patch: (input.patch as unknown as Record<string, unknown>) ?? null,
        equity: input.equity ?? null,
        tier: (input.tier as BotSettingsSnapshot['tier']) ?? null,
      }),
    );
  }

  private toSnapshotView(row: BotSettingsSnapshot): BotSettingsSnapshotView {
    return {
      id: row.id,
      at: Number(row.at),
      etDateKey: row.etDateKey,
      source: row.source,
      settings: row.settings as unknown as BotSettingsView,
      patch: (row.patch as unknown as Partial<BotSettingsView>) ?? null,
      equity: row.equity != null ? Number(row.equity) : null,
      tier: row.tier,
    };
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
