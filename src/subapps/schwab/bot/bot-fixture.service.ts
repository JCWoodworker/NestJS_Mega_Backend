import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { sameTrainerUnderlying } from '../bot-v2/bot-v2-config.util';
import { BotArchiveService } from './bot-archive.service';
import {
  inferUnderlying,
  type BacktestSession,
  type BacktestSnapshot,
} from './bot-backtest.util';
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
    /** `SPY`, `SPX`, or `SPXW`. Anything else is ignored. */
    underlying?: string;
  }): Promise<FixtureResponse> {
    const wanted = wantedUnderlying(range.underlying);
    const days = await this.marketDayRepository.find({
      order: { etDateKey: 'ASC' },
    });

    const daysWanted = days
      .filter((day) => !range.from || day.etDateKey >= range.from)
      .filter((day) => !range.to || day.etDateKey <= range.to)
      .slice(-MAX_SESSIONS);

    const sessions: BacktestSession[] = [];
    const incomplete: string[] = [];

    for (const day of daysWanted) {
      const rows = await this.snapshotRepository.find({
        where: { etDateKey: day.etDateKey },
        order: { at: 'ASC' },
      });

      // Sessions past the hot window live in S3. Bars stay in Postgres — one
      // row a day is nothing — so only the chain has to be fetched back.
      const recorded = rows.length
        ? rows.map((row) =>
            tagSnapshot(
              {
                at: Number(row.at),
                spot: row.spot == null ? null : Number(row.spot),
                quotes: row.quotes ?? [],
                expiration: row.expiration ?? null,
              },
              row.underlyingSymbol,
            ),
          )
        : (
            (await this.archiveService.readSession(day.etDateKey))?.snapshots ??
            []
          ).map((snapshot) => tagSnapshot(snapshot));
      const snapshots = recorded.filter((snapshot) =>
        snapshotMatches(snapshot, wanted),
      );

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

function wantedUnderlying(value?: string): 'SPY' | 'SPXW' | undefined {
  const upper = value?.trim().toUpperCase();
  if (upper === 'SPY') return 'SPY';
  if (upper === 'SPX' || upper === 'SPXW') return 'SPXW';
  return undefined;
}

function tagSnapshot(
  snapshot: BacktestSnapshot,
  explicit?: string | null,
): BacktestSnapshot {
  return {
    ...snapshot,
    underlying:
      explicit ?? snapshot.underlying ?? inferUnderlying(snapshot.spot) ?? null,
  };
}

function snapshotMatches(
  snapshot: BacktestSnapshot,
  wanted: 'SPY' | 'SPXW' | undefined,
): boolean {
  if (!wanted) return true;
  const tag = snapshot.underlying ?? inferUnderlying(snapshot.spot);
  if (!tag) return false;
  if (wanted === 'SPY') return tag === 'SPY';
  return sameTrainerUnderlying('SPXW', tag);
}
