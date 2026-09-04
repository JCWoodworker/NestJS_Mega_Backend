import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { BotLane } from '../enums/bot-lane.enum';
import { BotMode } from '../enums/bot-mode.enum';
import { BotDirection, BotStrategy } from '../enums/strategy.enum';

export interface BotOpenPosition {
  symbol: string;
  quantity: number;
  entryPrice: number;
  stopUnderlying: number | null;
  targetUnderlying: number | null;
  /** Option premium soft-stop (bid ≤ this → PREMIUM_STOP). */
  stopPremium?: number | null;
  /** Option premium target (bid ≥ this → PREMIUM_TARGET). */
  targetPremium?: number | null;
  source: BotLane;
}

export interface BotLastSignal {
  at: number;
  strategies: BotStrategy[];
  direction: BotDirection;
  reason: string;
}

/** Singleton runtime state for the bot control plane. */
@Entity('bot_state')
export class BotState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: BotMode,
    default: BotMode.MANUAL,
  })
  mode: BotMode;

  @Column({
    type: 'enum',
    enum: BotLane,
    nullable: true,
  })
  lane: BotLane | null;

  @Column({ type: 'boolean', default: false })
  running: boolean;

  @Column({ type: 'boolean', default: false })
  lockout: boolean;

  @Column({ type: 'text', name: 'lockout_reason', nullable: true })
  lockoutReason: string | null;

  /** ET calendar day (`YYYY-MM-DD`) the current lockout was set on — lets the
   * engine auto-clear a stale lockout at the next trading day's rollover
   * without a dedicated "unlock" endpoint. Null when not locked out. */
  @Column({
    type: 'varchar',
    length: 10,
    name: 'lockout_date_key',
    nullable: true,
  })
  lockoutDateKey: string | null;

  /** Separate from lane: live must be armed via /live/enable before BOT_LIVE. */
  @Column({ type: 'boolean', name: 'live_armed', default: false })
  liveArmed: boolean;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'paper_equity',
    default: 1000,
  })
  paperEquity: number;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'paper_settled_cash',
    default: 1000,
  })
  paperSettledCash: number;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'paper_day_start_equity',
    default: 1000,
  })
  paperDayStartEquity: number;

  @Column({ type: 'jsonb', name: 'open_position', nullable: true })
  openPosition: BotOpenPosition | null;

  @Column({ type: 'jsonb', name: 'last_signal', nullable: true })
  lastSignal: BotLastSignal | null;

  @Column({ type: 'text', name: 'last_error', nullable: true })
  lastError: string | null;

  @Column({ type: 'timestamptz', name: 'last_trade_at', nullable: true })
  lastTradeAt: Date | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
