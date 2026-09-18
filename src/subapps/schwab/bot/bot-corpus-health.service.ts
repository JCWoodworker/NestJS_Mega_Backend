import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import schwabConfig from '@schwab/config/schwab.config';
import { etDateKey } from '@schwab/pnl/et-date.util';

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
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
  ) {}

  async getHealth(): Promise<{
    recordingEnabled: boolean;
    ownerConfigured: boolean;
    etDate: string;
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

    return {
      recordingEnabled: this.config.botRecordingEnabled,
      ownerConfigured: !!ownerUserId,
      etDate: today,
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
          today: null,
          expectedPerSession: '3–15 on an active session',
          // The loudest signal in the checkpoint doc: under ~30 rows total
          // and no tuning conclusion is valid, because there is no sample.
          verdict: trades === 0 ? 'empty' : trades < 30 ? 'sparse' : 'ok',
          note:
            trades < 30
              ? 'Under ~30 trades total — not enough sample for any tuning conclusion'
              : null,
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
