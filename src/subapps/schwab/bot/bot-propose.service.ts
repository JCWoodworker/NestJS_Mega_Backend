import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import schwabConfig from '@schwab/config/schwab.config';
import { etDateKey } from '@schwab/pnl/et-date.util';
import { runAsUser } from '@schwab/shared/schwab-user-context';

import { defaultPolicyGrid, type AnalyzedTrade } from './bot-analysis.util';
import {
  buildWeeklyDossier,
  type DossierEvent,
  type DossierSession,
} from './bot-dossier.util';
import { BotProposeAgentService } from './bot-propose-agent.service';
import {
  buildEvidencePacket,
  type ProposePacket,
  type ProposeSettings,
} from './bot-propose.util';
import { BotEvent } from './entities/bot-event.entity';
import { BotMarketDay } from './entities/bot-market-day.entity';
import { BotProposal } from './entities/bot-proposal.entity';
import { BotSettings } from './entities/bot-settings.entity';
import { BotSettingsSnapshotSource } from './entities/bot-settings-snapshot.entity';
import { BotTradeTape } from './entities/bot-trade-tape.entity';
import { BotTrade } from './entities/bot-trade.entity';
import { BotSettingsService } from './bot-settings.service';

/**
 * Saturday evaluation. Scores strategy trades and, only when the replay
 * passes the gates and the agent flag is on, asks for a pull request.
 * A losing week is the input, not an automatic settings change.
 */
@Injectable()
export class BotProposeService {
  private readonly logger = new Logger(BotProposeService.name);

  constructor(
    @InjectRepository(BotTrade)
    private readonly tradeRepository: Repository<BotTrade>,
    @InjectRepository(BotTradeTape)
    private readonly tapeRepository: Repository<BotTradeTape>,
    @InjectRepository(BotSettings)
    private readonly settingsRepository: Repository<BotSettings>,
    @InjectRepository(BotProposal)
    private readonly proposalRepository: Repository<BotProposal>,
    @InjectRepository(BotEvent)
    private readonly eventRepository: Repository<BotEvent>,
    @InjectRepository(BotMarketDay)
    private readonly marketDayRepository: Repository<BotMarketDay>,
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
    private readonly agent: BotProposeAgentService,
    private readonly settings: BotSettingsService,
  ) {}

  /** Saturday 12:00 UTC. No-ops unless propose is explicitly enabled. */
  @Cron('0 12 * * 6')
  async cronPropose(): Promise<void> {
    if (!this.config.botProposeEnabled || !this.config.botSupervisorEnabled) {
      return;
    }
    try {
      await this.proposeWeek();
    } catch (err) {
      this.logger.error(`weekly propose failed: ${(err as Error).message}`);
    }
  }

  /**
   * 13:20 UTC is 09:20 EDT and 14:20 UTC is 09:20 EST. The ET clock check
   * keeps the other fire from applying an hour early or late.
   */
  @Cron('20 13,14 * * 1-5')
  async cronApply(): Promise<void> {
    if (!this.config.botProposeEnabled || !this.config.botSupervisorEnabled) {
      return;
    }
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const hour = parts.find((part) => part.type === 'hour')?.value;
    const minute = parts.find((part) => part.type === 'minute')?.value;
    if (hour !== '09' || minute !== '20') return;
    await this.applyMergedProposals();
  }

  async proposeWeek(now = new Date()): Promise<BotProposal | null> {
    const ownerUserId = this.config.ownerUserId;
    if (!ownerUserId) return null;

    const weekEndingEt = fridayOnOrBefore(now);
    const rows = await this.tradeRepository.find({
      where: { userId: ownerUserId },
      order: { closedAt: 'ASC' },
    });
    const trades = rows
      .map((row) => toAnalyzed(row))
      .filter((trade) => trade.etDateKey <= weekEndingEt);
    const settingsRow = await this.settingsRepository.findOneBy({
      userId: ownerUserId,
    });
    if (!settingsRow) return null;

    const tapeByTradeKey = await this.loadTape(ownerUserId, trades);
    const evidence = buildEvidencePacket({
      trades,
      tapeByTradeKey,
      policies: defaultPolicyGrid(),
      current: toProposeSettings(settingsRow),
      weekEndingEt,
    });

    const dossier = buildWeeklyDossier({
      weekEndingEt,
      trades: rows
        .filter((row) => row.etDateKey <= weekEndingEt)
        .map((row) => ({
          ...toAnalyzed(row),
          configVersion: row.configVersion ?? null,
        })),
      events: await this.loadEvents(ownerUserId),
      sessions: await this.loadSessions(weekEndingEt),
      tapeByTradeKey,
    });

    // Spread rather than nest so `packet.patch` stays where the 09:20 apply
    // path already looks for it.
    const packet: ProposePacket = { ...evidence, dossier };

    const saved = await this.proposalRepository.save({
      userId: ownerUserId,
      weekEndingEt,
      actionable: evidence.actionable,
      packet: packet as unknown as Record<string, unknown>,
      status: 'draft',
      appliedAt: null,
    });

    const launch = await this.agent.launch(packet);
    if (launch.status === 'launched') {
      saved.status = 'pr_open';
      await this.proposalRepository.save(saved);
    }
    this.logger.log(
      `Propose ${weekEndingEt}: ${dossier.sessions.length} session(s), ` +
        `${evidence.strategyTradeCount} strategy trades, ` +
        `capped-patch actionable=${evidence.actionable} ` +
        `(${evidence.blockedReasons.join(',') || 'no blockers'}), ` +
        `agent=${launch.status}`,
    );
    return saved;
  }

  /**
   * Refusal and signal events for the census. Retention on `bot_events` is 30
   * days, so this is a trailing window by construction — the dossier copies
   * what it finds into the proposal, which is durable.
   */
  private async loadEvents(userId: string): Promise<DossierEvent[]> {
    const rows = await this.eventRepository.find({
      where: { userId },
      order: { at: 'ASC' },
    });
    return rows.map((row) => ({
      at: Number(row.at),
      type: String(row.type),
      reason: row.reason ?? null,
      strategies: row.strategies ?? null,
      direction: row.direction == null ? null : String(row.direction),
      payload: row.payload ?? null,
    }));
  }

  private async loadSessions(weekEndingEt: string): Promise<DossierSession[]> {
    const rows = await this.marketDayRepository.find({
      order: { etDateKey: 'ASC' },
    });
    return rows
      .filter((row) => row.etDateKey <= weekEndingEt)
      .map((row) => ({
        etDateKey: row.etDateKey,
        bars: (row.bars ?? []) as DossierSession['bars'],
        fullSession: row.fullSession,
      }));
  }

  /** Applies a proposal only after a human has marked it merged. */
  async applyMergedProposals(): Promise<void> {
    const ownerUserId = this.config.ownerUserId;
    if (!ownerUserId) return;
    const pending = await this.proposalRepository.find({
      where: { userId: ownerUserId, status: 'merged' },
      order: { createdAt: 'ASC' },
    });
    for (const proposal of pending) {
      if (proposal.appliedAt) continue;
      const patch = (proposal.packet as { patch?: Record<string, number> }).patch;
      if (!patch || !Object.keys(patch).length) continue;
      await runAsUser(ownerUserId, () =>
        this.settings.updateSettings({
          ...patch,
          source: BotSettingsSnapshotSource.MANUAL,
        }),
      );
      proposal.appliedAt = new Date();
      proposal.status = 'applied';
      await this.proposalRepository.save(proposal);
      this.logger.log(`Applied proposal ${proposal.id} at the 09:20 ET window`);
    }
  }

  private async loadTape(
    userId: string,
    trades: AnalyzedTrade[],
  ): Promise<Map<string, { at: number; optionBid: number | null }[]>> {
    const byKey = new Map<string, { at: number; optionBid: number | null }[]>();
    if (!trades.length) return byKey;
    const rows = await this.tapeRepository.find({
      where: trades.map((trade) => ({ userId, tradeKey: trade.tradeKey })),
    });
    for (const row of rows) {
      const samples = byKey.get(row.tradeKey) ?? [];
      samples.push({
        at: Number(row.at),
        optionBid: row.optionBid == null ? null : Number(row.optionBid),
      });
      byKey.set(row.tradeKey, samples);
    }
    return byKey;
  }
}

function fridayOnOrBefore(now: Date): string {
  let cursor = now;
  for (let i = 0; i < 7; i += 1) {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
    }).format(cursor);
    if (weekday === 'Fri') return etDateKey(cursor);
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  return etDateKey(now);
}

function toProposeSettings(row: BotSettings): ProposeSettings {
  return {
    premiumTargetPct: Number(row.premiumTargetPct),
    premiumStopPct: Number(row.premiumStopPct),
    trailPct: Number(row.trailPct),
    trailArmPct: Number(row.trailArmPct),
  };
}

function toAnalyzed(row: BotTrade): AnalyzedTrade {
  const num = (value: unknown): number => Number(value ?? 0);
  const nullableNum = (value: unknown): number | null =>
    value == null ? null : Number(value);
  return {
    tradeKey: row.tradeKey,
    etDateKey: row.etDateKey,
    lane: String(row.lane),
    direction: row.direction == null ? null : String(row.direction),
    quantity: num(row.quantity),
    entryPrice: num(row.entryPrice),
    exitPrice: num(row.exitPrice),
    openedAt: new Date(row.openedAt).getTime(),
    closedAt: new Date(row.closedAt).getTime(),
    holdMs: num(row.holdMs),
    grossPnl: num(row.grossPnl),
    fees: num(row.fees),
    netPnl: num(row.netPnl),
    mfePremium: nullableNum(row.mfePremium),
    maePremium: nullableNum(row.maePremium),
    timeToMfeMs: nullableNum(row.timeToMfeMs),
    captureEfficiency: nullableNum(row.captureEfficiency),
    sampleCount: num(row.sampleCount),
    exitReason: row.exitReason == null ? null : String(row.exitReason),
    strategies: row.strategies ?? null,
  };
}
