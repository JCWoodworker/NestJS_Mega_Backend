import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { BotEventSide, BotEventType } from '../enums/bot-event-type.enum';
import { BotLane } from '../enums/bot-lane.enum';
import { BotDirection } from '../enums/strategy.enum';

/**
 * Append-only activity feed row (frontend contract §14j) — powers the live
 * watch sidebar / chart buy-sell dots. Trimmed to a ring buffer of the most
 * recent rows by `BotEventService` rather than time-based expiry, since
 * event volume tracks trading activity, not wall-clock time.
 */
@Entity('bot_events')
export class BotEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint', name: 'at' })
  at: string; // epoch ms — bigint round-trips as string via pg driver

  @Column({ type: 'enum', enum: BotLane, nullable: true })
  lane: BotLane | null;

  @Column({ type: 'enum', enum: BotEventType })
  type: BotEventType;

  @Column({ type: 'enum', enum: BotDirection, nullable: true })
  direction: BotDirection | null;

  @Column({ type: 'varchar', length: 4, nullable: true })
  side: BotEventSide | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  symbol: string | null;

  @Column({ type: 'int', nullable: true })
  quantity: number | null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 4,
    name: 'fill_price',
    nullable: true,
  })
  fillPrice: number | null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 4,
    name: 'underlying_price',
    nullable: true,
  })
  underlyingPrice: number | null;

  @Column({ type: 'jsonb', nullable: true })
  strategies: string[] | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 64, name: 'order_id', nullable: true })
  orderId: string | null;
}
