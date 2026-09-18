import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { BotLane } from '../enums/bot-lane.enum';

export enum BotCapitalEventReason {
  /** Ledger fell under the min-equity floor and was topped back up. */
  FLOOR_RESET = 'FLOOR_RESET',
  /** Operator called POST /bot/paper/reset. */
  MANUAL_RESET = 'MANUAL_RESET',
}

/**
 * Ledger of every capital injection into the paper account.
 *
 * Without this the equity curve lies: topping $3,800 back up to $6,000 looks
 * identical to a $2,200 gain, and it silently resets drawdown and every
 * percentage return. True performance is always derived as
 *
 *   cumulative net P&L = current balance − starting capital − Σ injections
 *
 * and period aggregates sum `bot_trades.net_pnl` rather than diffing balances,
 * which is what breaks when a reset lands mid-period.
 */
@Entity('bot_capital_events')
@Index(['userId', 'at'])
export class BotCapitalEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Owner-only in practice — see the note on `BotTrade.userId`. */
  @Column({ type: 'varchar', name: 'user_id' })
  userId: string;

  @Column({ type: 'timestamptz', name: 'at' })
  at: Date;

  /** ET calendar day, for joining against daily reports. */
  @Column({ type: 'varchar', length: 10, name: 'et_date_key' })
  etDateKey: string;

  @Column({ type: 'enum', enum: BotLane, nullable: true })
  lane: BotLane | null;

  @Column({ type: 'enum', enum: BotCapitalEventReason })
  reason: BotCapitalEventReason;

  @Column({ type: 'decimal', precision: 18, scale: 4, name: 'balance_before' })
  balanceBefore: number;

  @Column({ type: 'decimal', precision: 18, scale: 4, name: 'balance_after' })
  balanceAfter: number;

  /** Signed injection: `balanceAfter - balanceBefore`. */
  @Column({ type: 'decimal', precision: 18, scale: 4 })
  amount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
