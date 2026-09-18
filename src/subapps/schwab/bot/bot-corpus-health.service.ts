import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';

import schwabConfig from '@schwab/config/schwab.config';
import { SchwabRealizedTrade } from '@schwab/pnl/entities/schwab-realized-trade.entity';
import { etDateKey, etDayBounds } from '@schwab/pnl/et-date.util';
import { SchwabAccountResolver } from '@schwab/shared/schwab-account-resolver.service';
import { runAsUser } from '@schwab/shared/schwab-user-context';

import { BotCapitalEvent } from './entities/bot-capital-event.entity';
import { BotChainSnapshot } from './entities/bot-chain-snapshot.entity';
import { BotMarketDay } from './entities/bot-market-day.entity';
import { BotTradeTape } from './entities/bot-trade-tape.entity';
import { BotTrade } from './entities/bot-trade.entity';

export interface CorpusTableHealth {
  table: string;
  rows: number;
  /** Rows written for today's ET session, where the table is session-scoped. */
  today: number | null;
  /** What "today" should look like by the close, for eyeballing a gap. */
  expectedPerSession: string;
  /** Plain-language read on whether this looks right. */
  verdict: 'ok' | 'empty' | 'sparse' | 'unknown';
  note: string | null;
}

/**
 * Answers "is the recording actually working" for the improvement loop.
 *
 * The corpus is written unattended and only read weeks later by the nightly
 * analyzer, so a recorder that silently stops is invisible until the analysis
 * has no data to run on — which is exactly the failure the checkpoint doc
 * warns about ("large gaps → recorder died or the ET window gate is wrong").
 * Cheap row counts surfaced daily turn a six-week discovery into a
 * next-morning one.
 *
 * Owner-scoped: these tables only ever contain the owner's rows by design
 * (see `BotRecordingService.corpusUserId`), and the queries filter on that
 * anyway so a gate regression shows up as a count that does not match.
 */
@Injectable()
export class BotCorpusHealthService {
  private readonly logger = new Logger(BotCorpusHealthService.name);
  /** 09:30–16:00 ET at one snapshot per minute. */
  private static readonly SNAPSHOTS_PER_SESSION = 390;

  constructor(
    @InjectRepository(BotTradeTape)
    private readonly tapeRepository: Repository<BotTradeTape>,
    @InjectRepository(BotTrade)
    private readonly tradeRepository: Repository<BotTrade>,
    @InjectRepository(BotChainSnapshot)
    private readonly snapshotRepository: Repository<BotChainSnapshot>,
    @InjectRepository(BotMarketDay)
    private readonly marketDayRepository: Repository<BotMarketDay>,
    @InjectRepository(BotCapitalEvent)
    private readonly capitalEventRepository: Repository<BotCapitalEvent>,
    @InjectRepository(SchwabRealizedTrade)
    private readonly realizedTradeRepository: Repository<SchwabRealizedTrade>,
    private readonly accountResolver: SchwabAccountResolver,
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
  ) {}

  /**
   * Distinct user ids present in the owner-only tables.
   *
   * The corpus is meant to contain exactly one account's rows — the whole
   * analyzer rests on that, since a second account's trades would poison
   * every counterfactual while looking entirely plausible. The gate enforces
   * it in code, but a gate regression is silent by nature, so this checks the
   * data itself and reports anything that is not the owner.
   */
  private async findForeignAttribution(
    ownerUserId: string | null,
  ): Promise<string[]> {
    const rows: Array<{ user_id: string }> = await this.tradeRepository.query(
      `SELECT DISTINCT user_id FROM bot_trades
       UNION SELECT DISTINCT user_id FROM bot_trade_tape
       UNION SELECT DISTINCT user_id FROM bot_capital_events`,
    );
    return rows
      .map((row) => row.user_id)
      .filter((userId) => userId && userId !== ownerUserId);
  }

  /**
   * How many BOT_PAPER (or configured lane) trades the owner's own P&L
   * ledger says closed today, independent of the recorder entirely.
   *
   * This is the check that would have caught 2026-09-18: the corpus tables
   * silently stayed at zero for a full session while trades closed normally,
   * because `bot_trades`'s own row count has no way to know what it *should*
   * contain. A trade count from a completely different table — one the
   * recorder never writes to — is what makes a gap visible instead of
   * looking like an ordinary quiet day.
   *
   * Best-effort: resolving the account hash makes a live call the first time
   * it's not cached, and a disconnected owner would make that throw. A
   * health check must not itself become another way for this page to break,
   * so a failure here degrades to "unknown" rather than a 500.
   */
  private async countRealTradesToday(
    ownerUserId: string | null,
  ): Promise<number | null> {
    if (!ownerUserId) return null;
    try {
      const accountHash = await runAsUser(ownerUserId, () =>
        this.accountResolver.resolve(),
      );
      const { start, end } = etDayBounds(etDateKey(new Date()));
      // `end` is exclusive by contract (etDayBounds), and Between is
      // inclusive on both sides - a trade closing at exact UTC midnight
      // would double count into two ET days, which never happens for
      // options that stop trading at 16:00 ET, so the mismatch is moot here.
      return this.realizedTradeRepository.count({
        where: {
          accountHash,
          source: In(this.config.improvementLanes),
          closedAt: Between(start, end),
        },
      });
    } catch (err) {
      this.logger.warn(
        `countRealTradesToday failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  async getHealth(): Promise<{
    recordingEnabled: boolean;
    ownerConfigured: boolean;
    etDate: string;
    /** Non-empty means the corpus is contaminated — see findForeignAttribution. */
    foreignUserIds: string[];
    tables: CorpusTableHealth[];
  }> {
    const ownerUserId = this.config.ownerUserId;
    const today = etDateKey(new Date());

    const [tape, trades, snapshots, marketDays, capitalEvents] =
      await Promise.all([
        this.countOwned(this.tapeRepository, ownerUserId),
        this.countOwned(this.tradeRepository, ownerUserId),
        this.snapshotRepository.count(),
        this.marketDayRepository.count(),
        this.countOwned(this.capitalEventRepository, ownerUserId),
      ]);

    const snapshotsToday = await this.snapshotRepository.count({
      where: { etDateKey: today },
    });
    const marketDayToday = await this.marketDayRepository.count({
      where: { etDateKey: today },
    });
    const tradesRecordedToday = ownerUserId
      ? await this.tradeRepository.count({
          where: { userId: ownerUserId, etDateKey: today },
        })
      : 0;
    const tradesClosedToday = await this.countRealTradesToday(ownerUserId);

    const foreignUserIds = await this.findForeignAttribution(ownerUserId);

    return {
      recordingEnabled: this.config.botRecordingEnabled,
      ownerConfigured: !!ownerUserId,
      etDate: today,
      foreignUserIds,
      tables: [
        {
          table: 'bot_chain_snapshots',
          rows: snapshots,
          today: snapshotsToday,
          expectedPerSession: '~390 (1/min, 09:30–16:00 ET)',
          verdict: this.verdictForSession(
            snapshotsToday,
            BotCorpusHealthService.SNAPSHOTS_PER_SESSION,
          ),
          note: this.config.botRecordingEnabled
            ? null
            : 'BOT_RECORDING_ENABLED is not true on this app',
        },
        {
          table: 'bot_market_days',
          rows: marketDays,
          today: marketDayToday,
          expectedPerSession: '1 (backfilled after 16:05 ET)',
          verdict: marketDayToday > 0 ? 'ok' : 'empty',
          note: 'Backfills after the close, so empty is expected intraday',
        },
        {
          table: 'bot_trades',
          rows: trades,
          today: tradesRecordedToday,
          expectedPerSession: '3–15 on an active session',
          ...this.tradesTodayVerdict(
            tradesRecordedToday,
            tradesClosedToday,
            trades,
          ),
        },
        {
          table: 'bot_trade_tape',
          rows: tape,
          today: null,
          expectedPerSession: 'hundreds per trade-minute',
          verdict: tape === 0 ? 'empty' : 'ok',
          note:
            tape === 0
              ? 'Sparse tape also means the premium stop was often not evaluating'
              : null,
        },
        {
          table: 'bot_capital_events',
          rows: capitalEvents,
          today: null,
          expectedPerSession: 'ideally 0',
          // Inverted on purpose: rows here mean the bot needed refilling.
          verdict: capitalEvents === 0 ? 'ok' : 'sparse',
          note:
            capitalEvents > 0
              ? `${capitalEvents} capital injection(s) — the bot has been blowing through the floor`
              : null,
        },
      ],
    };
  }

  /**
   * Verdict for the `bot_trades` row, checked in order of how loud the
   * problem is: a live recording gap first (trades happened, nothing was
   * written — this is what 2026-09-18 looked like), then the plain
   * insufficient-sample warning the analyzer's readiness gate already uses.
   */
  private tradesTodayVerdict(
    recordedToday: number,
    closedToday: number | null,
    totalRows: number,
  ): { verdict: CorpusTableHealth['verdict']; note: string | null } {
    if (closedToday != null && closedToday > recordedToday) {
      const missed = closedToday - recordedToday;
      return {
        verdict: recordedToday === 0 ? 'empty' : 'sparse',
        note:
          `${closedToday} trade(s) closed today per the P&L ledger but only ` +
          `${recordedToday} recorded to the corpus — the recorder missed ${missed}. ` +
          `Check BotRecordingService logs for the gap window.`,
      };
    }
    if (totalRows === 0) return { verdict: 'empty', note: null };
    if (totalRows < 30) {
      return {
        verdict: 'sparse',
        note: 'Under ~30 trades total — not enough sample for any tuning conclusion',
      };
    }
    return { verdict: 'ok', note: null };
  }

  private async countOwned(
    repository: Repository<{ userId: string }>,
    ownerUserId: string | null,
  ): Promise<number> {
    if (!ownerUserId) return 0;
    return repository.count({ where: { userId: ownerUserId } });
  }

  private verdictForSession(
    today: number,
    expected: number,
  ): CorpusTableHealth['verdict'] {
    if (!this.config.botRecordingEnabled) return 'unknown';
    if (today === 0) return 'empty';
    // Mid-session counts are legitimately partial, so only flag a real gap.
    return today < expected * 0.5 ? 'sparse' : 'ok';
  }
}
