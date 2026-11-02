import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import schwabConfig from '@schwab/config/schwab.config';
import { etDateKey } from '@schwab/pnl/et-date.util';

import { defaultPolicyGrid, type AnalyzedTrade } from './bot-analysis.util';
import { runBacktest } from './bot-backtest.util';
import {
  buildWeeklyDossier,
  type DossierEvent,
  type DossierSession,
} from './bot-dossier.util';
import { BotFixtureService } from './bot-fixture.service';
import { BotProposeAgentService } from './bot-propose-agent.service';
import {
  applyCandidate,
  applySearchPatch,
  buildCandidates,
  configFromTrainer,
  firstHourRange,
  isQuiet,
  quietCutoff,
  SEARCH_LOOKBACK_DAYS,
  SEARCH_MAX_SESSIONS,
  splitHoldout,
  summarizeReplay,
  type SearchSummary,
  type TradeLite,
} from './bot-propose-search';
import {
  buildEvidencePacket,
  type ProposePacket,
  type ProposeSettings,
} from './bot-propose.util';
import { computeTradeExcursion, tradeKeyFor } from './bot-trade-metrics.util';
import {
  trainerBookKey,
  trainerBookKeyFromSettings,
} from '../bot-v2/bot-v2-config.util';
import { BotMarketDay } from './entities/bot-market-day.entity';
import { BotProposal } from './entities/bot-proposal.entity';
import { BotSearchLedger } from './entities/bot-search-ledger.entity';
import { BotSettings } from './entities/bot-settings.entity';
import { BotTradeTape } from './entities/bot-trade-tape.entity';
import { BotV2Event } from '../bot-v2/entities/bot-v2-event.entity';
import { BotV2Settings } from '../bot-v2/entities/bot-v2-settings.entity';
import { BotV2Trade } from '../bot-v2/entities/bot-v2-trade.entity';

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
    @InjectRepository(BotSettings)
    private readonly championSettings: Repository<BotSettings>,
    @InjectRepository(BotProposal)
    private readonly proposalRepository: Repository<BotProposal>,
    @InjectRepository(BotSearchLedger)
    private readonly ledgerRepository: Repository<BotSearchLedger>,
    @InjectRepository(BotV2Event)
    private readonly eventRepository: Repository<BotV2Event>,
    @InjectRepository(BotMarketDay)
    private readonly marketDayRepository: Repository<BotMarketDay>,
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
    private readonly agent: BotProposeAgentService,
    private readonly fixture: BotFixtureService,
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
    const settingsRow = await this.settingsRepository.findOneBy({
      userId: ownerUserId,
    });
    if (!settingsRow) return null;

    const tagged = rows
      .map((row) => ({ row, trade: toAnalyzed(row, events) }))
      .filter((item) => item.trade.etDateKey <= weekEndingEt);
    const byBook = new Map<string, AnalyzedTrade[]>();
    for (const item of tagged) {
      const key = trainerBookKey(item.row.configVersion);
      byBook.set(key, [...(byBook.get(key) ?? []), item.trade]);
    }
    const currentBook = trainerBookKeyFromSettings(settingsRow);
    const currentTrades = byBook.get(currentBook) ?? [];
    const largest = [...byBook.entries()].sort(
      (a, b) => b[1].length - a[1].length,
    )[0];
    const book = currentTrades.length
      ? currentBook
      : largest?.[0] ?? currentBook;
    const trades = currentTrades.length ? currentTrades : largest?.[1] ?? [];

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
          rows.find(
            (row) =>
              tradeKeyFor(row.symbol, Number(row.openedAt)) === trade.tradeKey,
          )?.configVersion ?? null,
      })),
      events,
      sessions: await this.loadSessions(weekEndingEt),
      tapeByTradeKey,
    });

    const search = await this.runSaturdaySearch(
      settingsRow,
      weekEndingEt,
      ownerUserId,
    );
    const packet: ProposePacket = {
      ...evidence,
      dossier,
      book,
      search,
      actionable: Boolean(
        search.winner && Object.keys(search.winner.patch).length,
      ),
      patch: {},
    };

    const saved = await this.proposalRepository.save({
      userId: ownerUserId,
      weekEndingEt,
      actionable: packet.actionable,
      packet: packet as unknown as Record<string, unknown>,
      status: 'draft',
      appliedAt: null,
    });
    await this.saveLedger(ownerUserId, weekEndingEt, search);

    const launch = search.winner
      ? await this.agent.launch(packet)
      : { status: 'no_winner' as const };
    if (launch.status === 'launched') {
      saved.status = 'pr_open';
      await this.proposalRepository.save(saved);
    }
    this.logger.log(
      `Propose ${weekEndingEt}: ${search.searchSessions.length} search session(s), ` +
        `${search.holdoutSessions.length} held out, ` +
        `winner=${search.winner?.label ?? 'none'}, ` +
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
        reason: noContract ? 'NO_CONTRACT_MATCH' : row.reason ?? null,
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
      const body = proposal.packet as {
        patch?: Record<string, number>;
        search?: SearchSummary;
      };
      const winnerPatch = body.search?.winner?.patch;
      if (body.search) {
        if (!winnerPatch || !Object.keys(winnerPatch).length) {
          proposal.appliedAt = new Date();
          proposal.status = 'applied';
          await this.proposalRepository.save(proposal);
          continue;
        }
        const row = await this.settingsRepository.findOneBy({
          userId: ownerUserId,
        });
        const personal = await this.championSettings.findOneBy({
          userId: ownerUserId,
        });
        if (!row) continue;
        if (!applySearchPatch(row, personal, winnerPatch)) continue;
        await this.settingsRepository.save(row);
        if (personal) await this.championSettings.save(personal);
      } else {
        const patch = body.patch;
        if (!patch || !Object.keys(patch).length) continue;
        const keys = [
          'lossCutPct',
          'protectArmPct',
          'protectFloorPct',
          'givebackPct',
          'tightFromPct',
          'tightGivebackPct',
        ] as const;
        const row = await this.settingsRepository.findOneBy({
          userId: ownerUserId,
        });
        const personal = await this.championSettings.findOneBy({
          userId: ownerUserId,
        });
        if (!row) continue;
        for (const key of keys) {
          const value = patch[key];
          if (typeof value !== 'number' || !Number.isFinite(value)) continue;
          row[key] = value;
          if (personal) personal[key] = value;
        }
        if (Number(row.protectFloorPct) >= Number(row.protectArmPct)) continue;
        await this.settingsRepository.save(row);
        if (personal) await this.championSettings.save(personal);
      }
      proposal.appliedAt = new Date();
      proposal.status = 'applied';
      await this.proposalRepository.save(proposal);
      this.logger.log(`Applied proposal ${proposal.id} at the 09:20 ET window`);
    }
  }

  private async saveLedger(
    userId: string,
    weekEndingEt: string,
    body: SearchSummary,
  ): Promise<void> {
    const existing = await this.ledgerRepository.findOneBy({
      userId,
      weekEndingEt,
    });
    if (existing) {
      existing.body = body;
      await this.ledgerRepository.save(existing);
      return;
    }
    await this.ledgerRepository.save({ userId, weekEndingEt, body });
  }

  /**
   * Replays the trainer one recorded day at a time. Snapshots for a day are
   * dropped before the next day is loaded.
   */
  private async runSaturdaySearch(
    settings: BotV2Settings,
    weekEndingEt: string,
    userId: string,
  ): Promise<SearchSummary> {
    const base = configFromTrainer(settings);
    const candidates = buildCandidates({
      rules: [...base.strategies],
      cooldownMins: base.cooldownMins,
      tradeWindowEnd: base.tradeWindowEnd,
      ladder: toProposeSettings(settings),
    });
    const days = await this.marketDayRepository.find({
      order: { etDateKey: 'ASC' },
    });
    const keys = days
      .map((day) => day.etDateKey)
      .filter((key) => key <= weekEndingEt)
      .slice(-SEARCH_LOOKBACK_DAYS);

    const ranges: Array<{ key: string; range: number | null }> = [];
    for (
      let index = keys.length - 1;
      index >= 0 && ranges.length < SEARCH_MAX_SESSIONS;
      index -= 1
    ) {
      const session = await this.fixture.loadSession(
        keys[index],
        base.underlying,
      );
      if (!session) continue;
      ranges.push({
        key: session.etDateKey,
        range: firstHourRange(session.snapshots),
      });
    }
    ranges.reverse();

    const split = splitHoldout(ranges.map((item) => item.key));
    const cutoff = quietCutoff(
      ranges
        .filter((item) => split.search.includes(item.key) && item.range != null)
        .map((item) => item.range as number),
    );
    const quiet = new Set(
      ranges
        .filter((item) => isQuiet(item.range, cutoff))
        .map((item) => item.key),
    );
    const tradesById = new Map<string, TradeLite[]>();
    for (const candidate of candidates) tradesById.set(candidate.id, []);

    for (const item of ranges) {
      const session = await this.fixture.loadSession(item.key, base.underlying);
      if (!session) continue;
      for (const candidate of candidates) {
        if (candidate.kind === 'quiet-days' && quiet.has(item.key)) continue;
        const result = runBacktest([session], applyCandidate(base, candidate));
        const bucket = tradesById.get(candidate.id) ?? [];
        for (const trade of result.trades) {
          bucket.push({
            etDateKey: trade.etDateKey,
            netPnl: trade.netPnl,
            fees: trade.fees,
          });
        }
        tradesById.set(candidate.id, bucket);
      }
      await new Promise((resolve) => setImmediate(resolve));
    }

    const prior = await this.ledgerRepository.find({
      where: { userId },
      order: { weekEndingEt: 'DESC' },
      take: 8,
    });
    const previous = prior.find((row) => row.weekEndingEt < weekEndingEt);
    const summary = summarizeReplay({
      sessionKeys: ranges.map((item) => item.key),
      candidates,
      tradesById,
      priorRules:
        previous?.body.rules.map((rule) => ({
          rule: rule.rule,
          searchNet: rule.search.net,
        })) ?? null,
      quietCutoffPts: cutoff,
    });
    this.logger.log(
      `Search ${weekEndingEt}: ${summary.searchSessions.length} fit / ` +
        `${summary.holdoutSessions.length} holdout, ` +
        `${candidates.length} candidates, ` +
        `quiet cutoff=${summary.quietCutoffPts ?? 'n/a'}`,
    );
    return summary;
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
    lossCutPct: Number(row.lossCutPct ?? 12),
    protectArmPct: Number(row.protectArmPct ?? 8),
    protectFloorPct: Number(row.protectFloorPct ?? 2),
    givebackPct: Number(row.givebackPct ?? 6),
    tightFromPct: Number(row.tightFromPct ?? 20),
    tightGivebackPct: Number(row.tightGivebackPct ?? 4),
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
    strategies:
      row.strategies ?? strategiesNearEntry(row.symbol, openedAt, events),
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
  if (
    Array.isArray(listed) &&
    listed.every((item) => typeof item === 'string')
  ) {
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
    if (typeof eventSymbol === 'string' && eventSymbol.trim() !== symbol.trim())
      continue;
    const distance = Math.abs(event.at - openedAt);
    if (distance > 2 * 60_000) continue;
    if (!best || distance < best.distance) {
      best = { distance, strategies: event.strategies };
    }
  }
  return best?.strategies ?? null;
}
