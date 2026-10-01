import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { V2ExitReason } from '../bot-v2-tick-exit.util';

const decimal = {
  to: (value: number | null) => value,
  from: (value: string | null) => (value == null ? null : Number(value)),
};

/** One sell. A scale-out and its runner are two rows with the same positionId. */
@Entity('bot_v2_trades')
export class BotV2Trade {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', name: 'user_id' })
  userId: string;

  @Index()
  @Column({ type: 'varchar', name: 'position_id' })
  positionId: string;

  @Column({ type: 'varchar' })
  symbol: string;

  @Column({ type: 'varchar' })
  underlying: string;

  @Column({ type: 'varchar' })
  direction: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'entry_price',
    transformer: decimal,
  })
  entryPrice: number;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'exit_price',
    transformer: decimal,
  })
  exitPrice: number;

  @Column({ type: 'varchar', name: 'exit_reason' })
  exitReason: V2ExitReason | 'EOD_FLATTEN' | 'SOCKET_LOSS' | 'STAND_DOWN';

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'gross_pnl',
    transformer: decimal,
  })
  grossPnl: number;

  @Column({ type: 'decimal', precision: 18, scale: 4, transformer: decimal })
  fees: number;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'net_pnl',
    transformer: decimal,
  })
  netPnl: number;

  @Column({ type: 'bigint', name: 'opened_at' })
  openedAt: string;

  @Column({ type: 'bigint', name: 'closed_at' })
  closedAt: string;

  @Column({ type: 'int', name: 'signal_bar_seconds' })
  signalBarSeconds: number;

  @Column({ type: 'varchar', name: 'config_version' })
  configVersion: string;

  /** Rules that agreed on the entry. Null on rows closed before this column. */
  @Column({ type: 'jsonb', nullable: true })
  strategies: string[] | null;

  @Column({ type: 'int', name: 'decision_latency_ms', nullable: true })
  decisionLatencyMs: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
