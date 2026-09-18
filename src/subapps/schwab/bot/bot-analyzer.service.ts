import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import schwabConfig from '@schwab/config/schwab.config';
import { etDateKey } from '@schwab/pnl/et-date.util';

import {
  aggregateTrades,
  assessReadiness,
  defaultPolicyGrid,
  scorePolicies,
  type AnalyzedTrade,
  type DailyAggregate,
  type PolicyResult,
  type Readiness,
} from './bot-analysis.util';
import { BotDailyReport } from './entities/bot-daily-report.entity';
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

    const rows = await this.tradeRepository.find({
      where: { userId: ownerUserId, etDateKey: dateKey },
      order: { closedAt: 'ASC' },
    });
    const trades = rows.map((row) => this.toAnalyzed(row));

    // Readiness is judged on the whole corpus, not the day: a single session
    // never reaches 30 trades, and the question is whether enough history
    // exists to trust a tuning conclusion at all.
    const cumulativeTrades = await this.tradeRepository.count({
      where: { userId: ownerUserId },
    });
    const readiness = assessReadiness(cumulativeTrades);

    const aggregate = aggregateTrades(dateKey, trades);

    // Only bother with the grid once a conclusion could mean something.
    // Below the gate it is noise that invites over-reading.
    const policyResults =
      readiness.level === 'insufficient'
        ? []
        : scorePolicies({
            trades,
            tapeByTradeKey: await this.loadTape(ownerUserId, trades),
            policies: defaultPolicyGrid(),
          });

    const markdown = this.renderMarkdown({
      dateKey,
      readiness,
      aggregate,
      policyResults,
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
  private renderMarkdown(params: {
    dateKey: string;
    readiness: Readiness;
    aggregate: DailyAggregate;
    policyResults: PolicyResult[];
  }): string {
    const { dateKey, readiness, aggregate, policyResults } = params;
    const mins = (ms: number | null) =>
      ms == null ? 'n/a' : `${(ms / 60_000).toFixed(1)}m`;
    const pct = (value: number | null) =>
      value == null ? 'n/a' : `${(value * 100).toFixed(1)}%`;

    const lines: string[] = [
      `# Bot report — ${dateKey}`,
      '',
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

    return lines.join('\n');
  }
}
