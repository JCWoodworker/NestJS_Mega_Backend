import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  BotEventPayload,
  OptionsGateway,
} from '@schwab/streaming/options.gateway';

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
}

/** Ring buffer size — frontend contract §14j asks for 200–500. */
const RING_SIZE = 500;

/**
 * Append-only activity feed (frontend contract §14j) backing the live watch
 * sidebar + chart buy/sell dots. Every recorded event is persisted (so
 * `GET /bot/events` / late socket joiners can catch up) and broadcast
 * immediately over `/options` as `bot-event`.
 */
@Injectable()
export class BotEventService {
  private readonly logger = new Logger(BotEventService.name);

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
      }),
    );
    this.optionsGateway.emitBotEvent(this.toPayload(row));
    this.trim().catch((err) =>
      this.logger.debug(`Ring-buffer trim skipped: ${err.message}`),
    );
    return row;
  }

  /** Newest-first, optionally only rows strictly newer than `afterId`
   * (catch-up pagination for a client that already has everything else). */
  async list(limit = 100, afterId?: number): Promise<BotEventPayload[]> {
    const qb = this.repository
      .createQueryBuilder('e')
      .orderBy('e.id', 'DESC')
      .take(Math.min(Math.max(limit, 1), RING_SIZE));
    if (afterId != null && !Number.isNaN(afterId)) {
      qb.andWhere('e.id > :afterId', { afterId });
    }
    const rows = await qb.getMany();
    return rows.map((r) => this.toPayload(r));
  }

  async recent(count: number): Promise<BotEventPayload[]> {
    return this.list(count);
  }

  private async trim(): Promise<void> {
    const count = await this.repository.count();
    if (count <= RING_SIZE) return;
    const excess = count - RING_SIZE;
    const oldest = await this.repository.find({
      order: { id: 'ASC' },
      take: excess,
    });
    if (oldest.length) await this.repository.remove(oldest);
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
    };
  }
}
