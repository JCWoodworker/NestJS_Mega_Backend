import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import schwabConfig from '@schwab/config/schwab.config';
import { etDateKey } from '@schwab/pnl/et-date.util';

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
import { BotV2Event } from '../bot-v2/entities/bot-v2-event.entity';
import { BotV2Settings } from '../bot-v2/entities/bot-v2-settings.entity';
import { BotV2Trade } from '../bot-v2/entities/bot-v2-trade.entity';
import { BotMarketDay } from './entities/bot-market-day.entity';
import { BotProposal } from './entities/bot-proposal.entity';
import { BotTradeTape } from './entities/bot-trade-tape.entity';
import { computeTradeExcursion, tradeKeyFor } from './bot-trade-metrics.util';

/**
 * Saturday evaluation of the house paper trainer.
 *
 * The dossier, the skip census, and the 09:20 settings apply all read
 * `bot_v2_*`. The retired champion book is not this review.
 */
@Injectable()
export class BotProposeService {
  private readonly logger = new Logger(BotProposeService.name);

  constructor(
    @InjectRepository(BotV2Trade)
    private readonly tradeRepository: Repository<BotV2Trade>,
    @InjectRepository(BotTradeTape)
    private readonly tapeRepository: Repository<BotTradeTape>,
    @InjectRepository(BotV2Settings)
    private readonly settingsRepository: Repository<BotV2Settings>,
    @InjectRepository(BotProposal)
    private readonly proposalRepository: Repository<BotProposal>,
    @InjectRepository(BotV2Event)
    private readonly eventRepository: Repository<BotV2Event>,
    @InjectRepository(BotMarketDay)
    private readonly marketDayRepository: Repository<BotMarketDay>,
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
    private readonly agent: BotProposeAgentService,
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
    const events = await this.loadEvents(ownerUserId);
    const rows = await this.tradeRepository.find({
      where: { userId: ownerUserId },
      order: { closedAt: 'ASC' },
    });
    const trades = rows
      .map((row) => toAnalyzed(row, events))
      .filter((trade) => trade.etDateKey <= weekEndingEt);
    const settingsRow = await this.settingsRepository.findOneBy({
      userId: ownerUserId,
    });
    if (!settingsRow) return null;

    const tapeByTradeKey = await this.loadTape(ownerUserId, trades);
    const reviewed = trades.map((trade) =>
      withTape(trade, tapeByTradeKey.get(trade.tradeKey) ?? []),
    );
    const evidence = buildEvidencePacket({
      trades: reviewed,
      tapeByTradeKey,
      policies: defaultPolicyGrid(),
      current: toProposeSettings(settingsRow),
      weekEndingEt,
    });

    const dossier = buildWeeklyDossier({
      weekEndingEt,
      trades: reviewed.map((trade) => ({
        ...trade,
        configVersion:
          rows.find((row) => tradeKeyFor(row.symbol, Number(row.openedAt)) === trade.tradeKey)
            ?.configVersion ?? null,
      })),
      events,
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
   * Trainer skips and entries. `bot_v2_events` keeps the reason on the row
   * and the strategy list in the payload, so the census sees the same shape
   * the champion events used.
   */
  private async loadEvents(userId: string): Promise<DossierEvent[]> {
    const rows = await this.eventRepository.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => {
      const payload = row.payload ?? null;
      const diagnostics = payload?.diagnostics as
        | { rejects?: Record<string, unknown> }
        | undefined;
      const noContract = row.reason === 'NO_CONTRACT';
      return {
        at: row.createdAt.getTime(),
        type: String(row.type),
        reason: noContract ? 'NO_CONTRACT_MATCH' : (row.reason ?? null),
        strategies: strategiesFromReason(row.reason, payload),
        direction: null,
        payload: noContract
          ? { ...(payload ?? {}), rejects: diagnostics?.rejects ?? {} }
          : payload,
      };
    });
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
      const row = await this.settingsRepository.findOneBy({ userId: ownerUserId });
      if (!row) continue;
      for (const key of ['premiumTargetPct', 'premiumStopPct', 'trailPct', 'trailArmPct'] as const) {
        const value = patch[key];
        if (typeof value === 'number' && Number.isFinite(value)) row[key] = value;
      }
      if (Number(row.trailMinLockPct) >= Number(row.trailArmPct)) continue;
      await this.settingsRepository.save(row);
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

function toProposeSettings(row: BotV2Settings): ProposeSettings {
  return {
    premiumTargetPct: Number(row.premiumTargetPct),
    premiumStopPct: Number(row.premiumStopPct),
    trailPct: Number(row.trailPct),
    trailArmPct: Number(row.trailArmPct),
  };
}

function toAnalyzed(row: BotV2Trade, events: DossierEvent[]): AnalyzedTrade {
  const openedAt = Number(row.openedAt);
  const closedAt = Number(row.closedAt);
  return {
    tradeKey: tradeKeyFor(row.symbol, openedAt),
    etDateKey: etDateKey(new Date(closedAt)),
    lane: 'BOT_PAPER',
    direction: row.direction,
    quantity: Number(row.quantity),
    entryPrice: Number(row.entryPrice),
    exitPrice: Number(row.exitPrice),
    openedAt,
    closedAt,
    holdMs: Math.max(0, closedAt - openedAt),
    grossPnl: Number(row.grossPnl),
    fees: Number(row.fees),
    netPnl: Number(row.netPnl),
    mfePremium: null,
    maePremium: null,
    timeToMfeMs: null,
    captureEfficiency: null,
    sampleCount: 0,
    exitReason: row.exitReason,
    strategies: row.strategies ?? strategiesNearEntry(row.symbol, openedAt, events),
  };
}

function withTape(
  trade: AnalyzedTrade,
  samples: Array<{ at: number; optionBid: number | null }>,
): AnalyzedTrade {
  const excursion = computeTradeExcursion({
    samples,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    openedAt: trade.openedAt,
  });
  return { ...trade, ...excursion };
}

function strategiesFromReason(
  reason: string | null,
  payload: Record<string, unknown> | null,
): string[] | null {
  const listed = payload?.strategies;
  if (Array.isArray(listed) && listed.every((item) => typeof item === 'string')) {
    return listed;
  }
  const match = reason?.match(/^(?:ANY|CONFIRMING) ([A-Z0-9_+]+) →/);
  if (!match) return null;
  return match[1].split('+').filter(Boolean);
}

/** Rows closed before `strategies` was stored still name the rule on the ENTRY event. */
function strategiesNearEntry(
  symbol: string,
  openedAt: number,
  events: DossierEvent[],
): string[] | null {
  let best: { distance: number; strategies: string[] } | null = null;
  for (const event of events) {
    if (event.type !== 'ENTRY' || !event.strategies?.length) continue;
    const eventSymbol = event.payload?.symbol;
    if (typeof eventSymbol === 'string' && eventSymbol.trim() !== symbol.trim()) continue;
    const distance = Math.abs(event.at - openedAt);
    if (distance > 2 * 60_000) continue;
    if (!best || distance < best.distance) {
      best = { distance, strategies: event.strategies };
    }
  }
  return best?.strategies ?? null;
}
