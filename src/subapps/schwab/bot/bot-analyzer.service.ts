import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import schwabConfig from '@schwab/config/schwab.config';
import { etDateKey, etDayBounds } from '@schwab/pnl/et-date.util';
import { BotV2Trade } from '@schwab/bot-v2/entities/bot-v2-trade.entity';

import {
  aggregateTrades,
  assessReadiness,
  defaultPolicyGrid,
  scorePolicies,
  scoreRapidScalpReplay,
  type AnalyzedTrade,
  type RapidScalpReplay,
  type DailyAggregate,
  type PolicyResult,
  type Readiness,
} from './bot-analysis.util';
import { NON_STRATEGY_EXIT_REASONS } from './bot-propose.util';
import { BotDailyReport } from './entities/bot-daily-report.entity';
import { computeTradeExcursion, tradeKeyFor } from './bot-trade-metrics.util';
import { BotTradeTape } from './entities/bot-trade-tape.entity';
import { BotTrade } from './entities/bot-trade.entity';

/**
 * Turns a session's recorded trades into a report.
 *
 * Runs from day one rather than waiting for a sample to accumulate: the
 * readiness gate is what makes that safe. With no trades it produces a report
 * saying so, which is strictly more useful than silence — it proves the
 * pipeline works, and a missing report becomes a real signal that something
 * broke.
 *
 * Deliberately owner-only and read-only over the corpus. It never touches
 * settings, never places an order, and never arms anything; the loop's
 * division of labour is that statistics decide significance and a human (or
 * a reviewed PR) makes changes.
 */
@Injectable()
export class BotAnalyzerService {
  private readonly logger = new Logger(BotAnalyzerService.name);

  constructor(
    @InjectRepository(BotTrade)
    private readonly tradeRepository: Repository<BotTrade>,
    @InjectRepository(BotTradeTape)
    private readonly tapeRepository: Repository<BotTradeTape>,
    @InjectRepository(BotDailyReport)
    private readonly reportRepository: Repository<BotDailyReport>,
    @InjectRepository(BotV2Trade)
    private readonly v2Trades: Repository<BotV2Trade>,
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
  ) {}

  /**
   * 21:30 UTC daily — the one UTC surface in the system.
   *
   * Safe year-round because the market closes 16:00 ET in both regimes:
   * 21:30 UTC is 16:30 EST and 17:30 EDT, comfortably after the close either
   * way. The report simply lands an hour later in summer, which is
   * irrelevant to a review done that evening or the next morning.
   */
  @Cron('30 21 * * *')
  async cronAnalyze(): Promise<void> {
    if (!this.config.botSupervisorEnabled) {
      // Same switch as the supervisor: exactly one app should analyze, or two
      // divergent reports get written for the same session.
      return;
    }
    try {
      await this.analyzeDay();
    } catch (err) {
      this.logger.error(`nightly analysis failed: ${(err as Error).message}`);
    }
  }

  /** Analyzes one ET session, defaulting to today, and persists the report. */
  async analyzeDay(dateKey = etDateKey(new Date())): Promise<{
    etDateKey: string;
    readiness: Readiness;
    aggregate: DailyAggregate;
    policyResults: PolicyResult[];
    markdown: string;
  } | null> {
    const ownerUserId = this.config.ownerUserId;
    if (!ownerUserId) {
      this.logger.warn('No SCHWAB_OWNER_USER_ID — nothing to analyze');
      return null;
    }

    const existing = await this.reportRepository.findOne({
      where: { userId: ownerUserId, etDateKey: dateKey },
    });
    const { start, end } = etDayBounds(dateKey);
    const rows = await this.v2Trades
      .createQueryBuilder('t')
      .where('t.user_id = :userId', { userId: ownerUserId })
      .andWhere('t.closed_at >= :start AND t.closed_at < :end', {
        start: String(start.getTime()),
        end: String(end.getTime()),
      })
      .orderBy('t.closed_at', 'ASC')
      .getMany();
    const existingBook = (existing?.aggregate as { book?: string } | null)?.book;
    if (rows.length === 0 && existing && existingBook !== 'v2') {
      this.logger.log(`Kept the champion report for ${dateKey}`);
      return null;
    }
    const mapped = rows.map((row) => this.toAnalyzedV2(row, dateKey));

    // Readiness for the new exit rule counts V2 trades, not the old book.
    const cumulativeTrades = await this.v2Trades.count({
      where: { userId: ownerUserId },
    });
    const readiness = assessReadiness(cumulativeTrades);

    // Only bother with the grid once a conclusion could mean something.
    // Below the gate it is noise that invites over-reading.
    const tapeByTradeKey =
      readiness.level === 'insufficient'
        ? new Map<string, { at: number; optionBid: number | null }[]>()
        : await this.loadTape(ownerUserId, mapped);
    const trades = mapped.map((trade) => {
      const excursion = computeTradeExcursion({
        samples: tapeByTradeKey.get(trade.tradeKey) ?? [],
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        openedAt: trade.openedAt,
      });
      return { ...trade, ...excursion };
    });

    const aggregate = {
      ...aggregateTrades(dateKey, trades),
      book: 'v2' as const,
      configVersion: rows[0]?.configVersion ?? null,
    };
    const policyResults =
      readiness.level === 'insufficient'
        ? []
        : scorePolicies({
            trades,
            tapeByTradeKey,
            policies: defaultPolicyGrid(),
          });
    const rapidScalpReplay = scoreRapidScalpReplay({ trades, tapeByTradeKey });

    const markdown = this.renderMarkdown({
      dateKey,
      readiness,
      aggregate,
      policyResults,
      rapidScalpReplay,
      bookNote:
        'This report counts the V2 paper book only. Older champion sessions stay in earlier reports and are not mixed into this readiness number.',
    });

    await this.reportRepository.save({
      userId: ownerUserId,
      etDateKey: dateKey,
      trades: aggregate.trades,
      cumulativeTrades,
      readinessLevel: readiness.level,
      grossPnl: aggregate.grossPnl,
      fees: aggregate.fees,
      netPnl: aggregate.netPnl,
      aggregate,
      policyResults,
      markdown,
      generatedAt: new Date(),
    });

    this.logger.log(
      `Analyzed ${dateKey}: ${aggregate.trades} trades, net ${aggregate.netPnl}, readiness ${readiness.level}`,
    );

    return {
      etDateKey: dateKey,
      readiness,
      aggregate,
      policyResults,
      markdown,
    };
  }

  /** Report index for the admin console — no markdown, to keep it small. */
  async listReports(
    limit = 30,
  ): Promise<
    Pick<
      BotDailyReport,
      | 'etDateKey'
      | 'trades'
      | 'cumulativeTrades'
      | 'readinessLevel'
      | 'netPnl'
      | 'generatedAt'
    >[]
  > {
    const ownerUserId = this.config.ownerUserId;
    if (!ownerUserId) return [];

    return this.reportRepository.find({
      where: { userId: ownerUserId },
      select: [
        'etDateKey',
        'trades',
        'cumulativeTrades',
        'readinessLevel',
        'netPnl',
        'generatedAt',
      ],
      order: { etDateKey: 'DESC' },
      take: limit,
    });
  }

  async getReport(dateKey: string): Promise<BotDailyReport | null> {
    const ownerUserId = this.config.ownerUserId;
    if (!ownerUserId) return null;

    return this.reportRepository.findOne({
      where: { userId: ownerUserId, etDateKey: dateKey },
    });
  }

  private async loadTape(
    userId: string,
    trades: AnalyzedTrade[],
  ): Promise<Map<string, { at: number; optionBid: number | null }[]>> {
    const byKey = new Map<string, { at: number; optionBid: number | null }[]>();
    if (!trades.length) return byKey;

    const rows = await this.tapeRepository.find({
      where: trades.map((trade) => ({ userId, tradeKey: trade.tradeKey })),
      order: { at: 'ASC' },
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

  private toAnalyzed(row: BotTrade): AnalyzedTrade {
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

  /**
   * The artifact a human (or the nightly agent) actually reads.
   *
   * Leads with what may be concluded rather than with numbers, because the
   * failure mode this loop is most prone to is reading a confident story into
   * a handful of trades.
   */
  private toAnalyzedV2(row: BotV2Trade, etDateKey: string): AnalyzedTrade {
    const openedAt = Number(row.openedAt);
    const closedAt = Number(row.closedAt);
    return {
      tradeKey: tradeKeyFor(row.symbol, openedAt),
      etDateKey,
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
      strategies: row.strategies ?? null,
    };
  }

  private renderMarkdown(params: {
    dateKey: string;
    readiness: Readiness;
    aggregate: DailyAggregate;
    policyResults: PolicyResult[];
    rapidScalpReplay: RapidScalpReplay;
    bookNote?: string;
  }): string {
    const { dateKey, readiness, aggregate, policyResults, rapidScalpReplay, bookNote } =
      params;
    const mins = (ms: number | null) =>
      ms == null ? 'n/a' : `${(ms / 60_000).toFixed(1)}m`;
    const pct = (value: number | null) =>
      value == null ? 'n/a' : `${(value * 100).toFixed(1)}%`;

    const lines: string[] = [
      `# Bot report — ${dateKey}`,
      '',
      ...(bookNote ? [bookNote, ''] : []),
      `**Readiness: ${readiness.level}.** ${readiness.note}`,
      '',
      '## Session',
      '',
      `- Trades: ${aggregate.trades} (${aggregate.wins}W / ${
        aggregate.losses
      }L, win rate ${pct(aggregate.winRate)})`,
      `- Net P&L: ${aggregate.netPnl} (gross ${aggregate.grossPnl}, fees ${aggregate.fees})`,
      `- Expectancy: ${aggregate.expectancy ?? 'n/a'} per trade`,
      `- Profit factor: ${aggregate.profitFactor ?? 'n/a'}`,
      `- Fee drag on gross profit: ${pct(aggregate.feeDragPct)}`,
    ];

    if (aggregate.trades > 0) {
      lines.push(
        '',
        '## Exits or entries?',
        '',
        `- Median capture efficiency: ${pct(
          aggregate.medianCaptureEfficiency,
        )} — the share of the best available move actually realised. Low means the entries are fine and the exits are giving it back.`,
        `- Median time to peak: ${mins(
          aggregate.medianTimeToMfeMs,
        )} against a median hold of ${mins(
          aggregate.medianHoldMs,
        )}. A peak much earlier than the exit points at a time stop or a trailing stop.`,
        `- Trades with no bid to evaluate: ${pct(
          aggregate.blindTradePct,
        )} — anything high here means "the stop did not work" is a missing-data result, not a strategy result.`,
        '',
        '## Exit reason attribution',
        '',
        '| Reason | Trades | Net | Avg |',
        '| --- | --- | --- | --- |',
        ...aggregate.exitReasons.map(
          (r) => `| ${r.reason} | ${r.trades} | ${r.netPnl} | ${r.avgNetPnl} |`,
        ),
      );
      const ops = aggregate.exitReasons.filter((r) =>
        NON_STRATEGY_EXIT_REASONS.has(r.reason),
      );
      if (ops.length) {
        const opsTrades = ops.reduce((sum, r) => sum + r.trades, 0);
        const opsNet = ops.reduce((sum, r) => sum + r.netPnl, 0);
        lines.push(
          '',
          '## Ops exits',
          '',
          `Infrastructure flattens (${[...NON_STRATEGY_EXIT_REASONS].join(', ')}): ${opsTrades} trades, net ${opsNet}. These stay in the session totals above and are excluded from propose-readiness.`,
        );
      }
    }

    if (policyResults.length) {
      lines.push(
        '',
        '## Counterfactual exit policies',
        '',
        'Entries held fixed; only the exit rule varies.',
        '',
        '| Stop | Target | Time | Trail | Trades | Net | vs actual |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        ...policyResults
          .slice(0, 8)
          .map(
            (r) =>
              `| ${pct(r.policy.stopPct)} | ${pct(r.policy.targetPct)} | ${mins(
                r.policy.timeStopMs,
              )} | ${pct(r.policy.trailPct)} | ${r.trades} | ${r.netPnl} | ${
                r.deltaVsActual > 0 ? '+' : ''
              }${r.deltaVsActual} |`,
          ),
      );
    } else if (aggregate.trades > 0) {
      lines.push(
        '',
        '## Counterfactual exit policies',
        '',
        'Skipped — the sample is below the threshold where a winning policy means anything.',
      );
    }

    lines.push(
      '',
      '## Rapid scalp replay',
      '',
      `Same entries, fee-aware exit of about 1% of cost, or the 25% premium stop if that prints first. Scored ${rapidScalpReplay.tradesScored}, unscored ${rapidScalpReplay.tradesUnscored}. Hypothetical net ${rapidScalpReplay.netPnl} versus actual ${rapidScalpReplay.actualNetPnl} (${rapidScalpReplay.deltaVsActual > 0 ? '+' : ''}${rapidScalpReplay.deltaVsActual}).`,
      '',
      rapidScalpReplay.note,
    );

    return lines.join('\n');
  }
}
