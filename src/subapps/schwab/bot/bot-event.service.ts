import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';

import {
  BotEventPayload,
  OptionsGateway,
} from '@schwab/streaming/options.gateway';

import { ListEventsDto } from './dto/list-events.dto';
import { BotEvent } from './entities/bot-event.entity';
import { BotEventSide, BotEventType } from './enums/bot-event-type.enum';
import { BotLane } from './enums/bot-lane.enum';
import { BotDirection } from './enums/strategy.enum';

export interface RecordBotEventInput {
  lane: BotLane | null;
  type: BotEventType;
  direction?: BotDirection | null;
  side?: BotEventSide | null;
  symbol?: string | null;
  quantity?: number | null;
  fillPrice?: number | null;
  underlyingPrice?: number | null;
  strategies?: string[] | null;
  reason?: string | null;
  orderId?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface BotEventListResult {
  items: BotEventPayload[];
  limit: number;
  /** Pass as `beforeId` to load the next older page. */
  nextBeforeId: number | null;
  /** Pass as `afterId` to load newer rows than this page's newest. */
  nextAfterId: number | null;
  hasMoreOlder: boolean;
  hasMoreNewer: boolean;
}

/** Max rows returned by a single list/recent query (not retention). */
const LIST_CAP = 1000;

/** Keep decision/operator history for 30 days. */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Append-only activity + decision-audit feed. Persisted for catch-up /
 * `GET /bot/events` / explain, and broadcast over `/options` as `bot-event`.
 */
@Injectable()
export class BotEventService {
  private readonly logger = new Logger(BotEventService.name);
  /** In-process dedupe: `${type}:${reason}:${chartTime}` → last emit ms. */
  private readonly recentDedupe = new Map<string, number>();

  constructor(
    @InjectRepository(BotEvent)
    private readonly repository: Repository<BotEvent>,
    private readonly optionsGateway: OptionsGateway,
  ) {}

  async record(input: RecordBotEventInput): Promise<BotEvent> {
    const row = await this.repository.save(
      this.repository.create({
        at: String(Date.now()),
        lane: input.lane,
        type: input.type,
        direction: input.direction ?? null,
        side: input.side ?? null,
        symbol: input.symbol ?? null,
        quantity: input.quantity ?? null,
        fillPrice: input.fillPrice ?? null,
        underlyingPrice: input.underlyingPrice ?? null,
        strategies: input.strategies ?? null,
        reason: input.reason ?? null,
        orderId: input.orderId ?? null,
        payload: input.payload ?? null,
      }),
    );
    this.optionsGateway.emitBotEvent(this.toPayload(row));
    this.trim().catch((err) =>
      this.logger.debug(`Retention trim skipped: ${err.message}`),
    );
    return row;
  }

  /**
   * Record at most once per (type, reason, chartTime) within ~55s. Used for
   * GATE_SKIP / NO_SIGNAL so option-chart candles don't double-write a bar.
   */
  async recordDeduped(
    input: RecordBotEventInput,
    chartTime: number | null | undefined,
  ): Promise<BotEvent | null> {
    const key = `${input.type}:${input.reason ?? ''}:${chartTime ?? 'na'}`;
    const now = Date.now();
    const prev = this.recentDedupe.get(key);
    if (prev != null && now - prev < 55_000) {
      return null;
    }
    this.recentDedupe.set(key, now);
    if (this.recentDedupe.size > 500) {
      for (const [k, at] of this.recentDedupe) {
        if (now - at > 120_000) this.recentDedupe.delete(k);
      }
    }
    return this.record({
      ...input,
      payload: {
        ...(input.payload ?? {}),
        ...(chartTime != null ? { chartTime } : {}),
      },
    });
  }

  /**
   * Newest-first log browser. Prefer `beforeId` to scroll older; `afterId` for
   * catch-up of rows newer than a known id.
   */
  async list(query: ListEventsDto = {}): Promise<BotEventListResult> {
    const limit = Math.min(Math.max(query.limit ?? 100, 1), LIST_CAP);
    const qb = this.repository
      .createQueryBuilder('e')
      .orderBy('e.id', 'DESC')
      .take(limit + 1); // one extra to detect hasMoreOlder

    if (query.afterId != null && !Number.isNaN(query.afterId)) {
      qb.andWhere('e.id > :afterId', { afterId: query.afterId });
    }
    if (query.beforeId != null && !Number.isNaN(query.beforeId)) {
      qb.andWhere('e.id < :beforeId', { beforeId: query.beforeId });
    }
    if (query.type?.length) {
      qb.andWhere('e.type IN (:...types)', { types: query.type });
    }
    if (query.lane) {
      qb.andWhere('e.lane = :lane', { lane: query.lane });
    }
    if (query.reason) {
      qb.andWhere('e.reason = :reason', { reason: query.reason });
    }
    if (query.from != null && !Number.isNaN(query.from)) {
      qb.andWhere('e.at >= :from', { from: String(query.from) });
    }
    if (query.to != null && !Number.isNaN(query.to)) {
      qb.andWhere('e.at <= :to', { to: String(query.to) });
    }
    if (query.q?.trim()) {
      const q = `%${query.q.trim()}%`;
      qb.andWhere(
        `(e.reason ILIKE :q OR e.symbol ILIKE :q OR e.order_id ILIKE :q OR CAST(e.payload AS text) ILIKE :q)`,
        { q },
      );
    }

    const rows = await qb.getMany();
    const hasMoreOlder = rows.length > limit;
    const page = hasMoreOlder ? rows.slice(0, limit) : rows;
    const items = page.map((r) => this.toPayload(r));
    const newestId = page.length ? page[0].id : null;
    const oldestId = page.length ? page[page.length - 1].id : null;

    let hasMoreNewer = false;
    if (newestId != null) {
      const newerCount = await this.repository
        .createQueryBuilder('e')
        .where('e.id > :newestId', { newestId })
        .getCount();
      hasMoreNewer = newerCount > 0;
    }

    return {
      items,
      limit,
      nextBeforeId: oldestId,
      nextAfterId: newestId,
      hasMoreOlder,
      hasMoreNewer,
    };
  }

  /** Newest-first plain array (status.recentEvents / explain). */
  async recent(count: number): Promise<BotEventPayload[]> {
    const result = await this.list({ limit: count });
    return result.items;
  }

  private async trim(): Promise<void> {
    const cutoff = String(Date.now() - RETENTION_MS);
    await this.repository.delete({ at: LessThan(cutoff) });
  }

  private toPayload(row: BotEvent): BotEventPayload {
    return {
      id: String(row.id),
      at: Number(row.at),
      lane: row.lane,
      type: row.type,
      direction: row.direction ?? undefined,
      side: row.side ?? undefined,
      symbol: row.symbol ?? undefined,
      quantity: row.quantity ?? undefined,
      fillPrice: row.fillPrice != null ? Number(row.fillPrice) : undefined,
      underlyingPrice:
        row.underlyingPrice != null ? Number(row.underlyingPrice) : undefined,
      strategies: row.strategies ?? undefined,
      reason: row.reason ?? undefined,
      orderId: row.orderId ?? undefined,
      payload: row.payload ?? undefined,
    };
  }
}
