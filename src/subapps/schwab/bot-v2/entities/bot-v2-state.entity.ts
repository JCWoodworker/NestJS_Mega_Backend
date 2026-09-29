import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { BotV2OpenPosition } from './bot-v2-position';

const decimal = {
  to: (value: number | null) => value,
  from: (value: string | null) => (value == null ? null : Number(value)),
};

@Entity('bot_v2_state')
export class BotV2State {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('UQ_bot_v2_state_user_id', { unique: true })
  @Column({ type: 'varchar', name: 'user_id' })
  userId: string;

  /** MANUAL until POST /bot-v2/arm. There is no live lane. */
  @Column({ type: 'varchar', default: 'MANUAL' })
  mode: 'MANUAL' | 'BOT';

  @Column({ type: 'boolean', default: false })
  running: boolean;

  @Column({ type: 'boolean', default: false })
  lockout: boolean;

  @Column({ type: 'text', name: 'lockout_reason', nullable: true })
  lockoutReason: string | null;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'paper_equity',
    default: 10000,
    transformer: decimal,
  })
  paperEquity: number;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'paper_settled_cash',
    default: 10000,
    transformer: decimal,
  })
  paperSettledCash: number;

  @Column({ type: 'jsonb', name: 'open_position', nullable: true })
  openPosition: BotV2OpenPosition | null;

  @Column({ type: 'timestamptz', name: 'last_trade_at', nullable: true })
  lastTradeAt: Date | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
