import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { gunzipSync, gzipSync } from 'zlib';
import { LessThan, Repository } from 'typeorm';

import { etDateKey } from '@schwab/pnl/et-date.util';

import { type BacktestSnapshot } from './bot-backtest.util';
import { BotChainSnapshot } from './entities/bot-chain-snapshot.entity';

/**
 * How long chain snapshots stay queryable in Postgres.
 *
 * At five-second sampling a session is roughly ten megabytes, so the hot
 * window is what decides whether the database plan is a recurring decision or
 * a settled one. Ninety days covers every review that reads recent history
 * directly; anything older is reachable through the archive.
 */
const HOT_WINDOW_DAYS = 90;

/** Sessions to move per run, so one night cannot stall on a long backlog. */
const MAX_SESSIONS_PER_RUN = 5;

interface ArchivedSession {
  etDateKey: string;
  underlyingSymbol: string;
  snapshots: BacktestSnapshot[];
}

/**
 * Moves aged chain snapshots to S3 and drops them from Postgres.
 *
 * Deliberately refuses to fall back to any other AWS credentials: the bucket
 * lives in a separate business account, and quietly writing business market
 * data into the personal bucket because one variable was missing is worse
 * than not archiving at all. A missing config var disables this outright.
 *
 * Rows are deleted only after the object is written *and* read back. The
 * IAM user has no delete permission on the bucket, so the failure this
 * guards against is a partial write, not a later erasure.
 */
@Injectable()
export class BotArchiveService {
  private readonly logger = new Logger(BotArchiveService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string | undefined;

  constructor(
    @InjectRepository(BotChainSnapshot)
    private readonly snapshotRepository: Repository<BotChainSnapshot>,
  ) {
    this.bucket = process.env.AWS_S3_BUCKET_NAME_SCHWAB;
    const region = process.env.AWS_REGION_SCHWAB;
    const accessKeyId = process.env.AWS_ACCESS_KEY_SCHWAB;
    const secretAccessKey = process.env.AWS_SECRET_KEY_SCHWAB;

    this.client =
      this.bucket && region && accessKeyId && secretAccessKey
        ? new S3Client({ region, credentials: { accessKeyId, secretAccessKey } })
        : null;
  }

  get enabled(): boolean {
    return this.client != null;
  }

  /** 02:30 UTC, well clear of the session and the evening backfill. */
  @Cron('30 2 * * *')
  async cronArchive(): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.archiveAged();
    } catch (err) {
      this.logger.error(`archive run failed: ${(err as Error).message}`);
    }
  }

  async archiveAged(now = new Date()): Promise<string[]> {
    if (!this.client || !this.bucket) return [];

    const cutoff = etDateKey(
      new Date(now.getTime() - HOT_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    );

    const aged = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('snapshot.etDateKey', 'etDateKey')
      .where('snapshot.etDateKey < :cutoff', { cutoff })
      .groupBy('snapshot.etDateKey')
      .orderBy('snapshot.etDateKey', 'ASC')
      .limit(MAX_SESSIONS_PER_RUN)
      .getRawMany<{ etDateKey: string }>();

    const archived: string[] = [];
    for (const { etDateKey: dateKey } of aged) {
      await this.archiveSession(dateKey);
      archived.push(dateKey);
    }

    if (archived.length) {
      this.logger.log(
        `Archived ${archived.length} session(s) older than ${cutoff}: ${archived.join(', ')}`,
      );
    }
    return archived;
  }

  private keyFor(dateKey: string): string {
    return `bot-archive/chain/${dateKey}.json.gz`;
  }

  private async archiveSession(dateKey: string): Promise<void> {
    const rows = await this.snapshotRepository.find({
      where: { etDateKey: dateKey },
      order: { at: 'ASC' },
    });
    if (!rows.length) return;

    const payload: ArchivedSession = {
      etDateKey: dateKey,
      underlyingSymbol: rows[0].underlyingSymbol,
      snapshots: rows.map((row) => ({
        at: Number(row.at),
        spot: row.spot == null ? null : Number(row.spot),
        quotes: row.quotes ?? [],
        expiration: row.expiration ?? null,
      })),
    };

    const body = gzipSync(Buffer.from(JSON.stringify(payload)));
    await this.client!.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.keyFor(dateKey),
        Body: body,
        ContentType: 'application/json',
        ContentEncoding: 'gzip',
      }),
    );

    // Read back before deleting. A truncated upload that still returned 200
    // would otherwise take the only copy with it.
    const restored = await this.readSession(dateKey);
    if (restored?.snapshots.length !== payload.snapshots.length) {
      throw new Error(
        `Archive read-back mismatch for ${dateKey}: wrote ` +
          `${payload.snapshots.length}, read ${restored?.snapshots.length ?? 0}`,
      );
    }

    await this.snapshotRepository.delete({ etDateKey: dateKey });
  }

  /** Fetch an archived session, or null when it was never archived. */
  async readSession(dateKey: string): Promise<ArchivedSession | null> {
    if (!this.client || !this.bucket) return null;
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: this.keyFor(dateKey),
        }),
      );
      const raw = await response.Body?.transformToByteArray();
      if (!raw) return null;
      return JSON.parse(gunzipSync(Buffer.from(raw)).toString()) as ArchivedSession;
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === 'NoSuchKey' || name === 'NotFound') return null;
      throw err;
    }
  }
}
