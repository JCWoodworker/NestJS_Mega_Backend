import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { BotArchiveService } from './bot-archive.service';
import { type BacktestSession } from './bot-backtest.util';
import { BotChainSnapshot } from './entities/bot-chain-snapshot.entity';
import { BotMarketDay } from './entities/bot-market-day.entity';

/** Sessions a fixture request may cover, so one call cannot pull the corpus. */
const MAX_SESSIONS = 15;

export interface FixtureResponse {
  sessions: BacktestSession[];
  /** Sessions asked for that had bars but no chain snapshots, or vice versa. */
  incomplete: string[];
}

/**
 * Assembles recorded sessions for an offline replay.
 *
 * Bars and chain snapshots are stored separately and can disagree: the
 * recorder may have been down for one and not the other, and a session with
 * bars but no chain cannot be replayed at all. Reporting those by name beats
 * silently returning a short list that looks complete.
 */
@Injectable()
export class BotFixtureService {
  private readonly logger = new Logger(BotFixtureService.name);

  constructor(
    @InjectRepository(BotMarketDay)
    private readonly marketDayRepository: Repository<BotMarketDay>,
    @InjectRepository(BotChainSnapshot)
    private readonly snapshotRepository: Repository<BotChainSnapshot>,
    private readonly archiveService: BotArchiveService,
  ) {}

  async getFixture(range: {
    from?: string;
    to?: string;
  }): Promise<FixtureResponse> {
    const days = await this.marketDayRepository.find({
      order: { etDateKey: 'ASC' },
    });

    const wanted = days
      .filter((day) => !range.from || day.etDateKey >= range.from)
      .filter((day) => !range.to || day.etDateKey <= range.to)
      .slice(-MAX_SESSIONS);

    const sessions: BacktestSession[] = [];
    const incomplete: string[] = [];

    for (const day of wanted) {
      const rows = await this.snapshotRepository.find({
        where: { etDateKey: day.etDateKey },
        order: { at: 'ASC' },
      });

      // Sessions past the hot window live in S3. Bars stay in Postgres — one
      // row a day is nothing — so only the chain has to be fetched back.
      const snapshots = rows.length
        ? rows.map((row) => ({
            at: Number(row.at),
            spot: row.spot == null ? null : Number(row.spot),
            quotes: row.quotes ?? [],
            expiration: row.expiration ?? null,
          }))
        : ((await this.archiveService.readSession(day.etDateKey))?.snapshots ??
          []);

      if (!snapshots.length) {
        incomplete.push(day.etDateKey);
        continue;
      }

      sessions.push({
        etDateKey: day.etDateKey,
        bars: (day.bars ?? []).map(([chartTime, open, high, low, close, volume]) => ({
          chartTime,
          open,
          high,
          low,
          close,
          volume,
        })),
        snapshots,
      });
    }

    this.logger.log(
      `Fixture ${range.from ?? 'start'}..${range.to ?? 'now'}: ` +
        `${sessions.length} session(s)` +
        (incomplete.length ? `, ${incomplete.length} without chain data` : ''),
    );

    return { sessions, incomplete };
  }
}
