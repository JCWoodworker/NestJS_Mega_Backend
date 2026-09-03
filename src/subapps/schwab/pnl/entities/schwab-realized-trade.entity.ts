import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { TradeDirection } from '../enums/trade-direction.enum';

@Entity('schwab_realized_trades')
@Index(['accountHash', 'closedAt'])
@Index(['accountHash', 'symbol'])
export class SchwabRealizedTrade {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, name: 'account_hash' })
  accountHash: string;

  @Column({ type: 'varchar', length: 64 })
  symbol: string;

  @Column({
    type: 'enum',
    enum: TradeDirection,
  })
  direction: TradeDirection;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  quantity: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, name: 'open_price' })
  openPrice: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, name: 'close_price' })
  closePrice: number;

  @Column({ type: 'timestamptz', name: 'opened_at' })
  openedAt: Date;

  @Column({ type: 'timestamptz', name: 'closed_at' })
  closedAt: Date;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'realized_pnl',
  })
  realizedPnl: number;

  @Column({ type: 'uuid', name: 'open_fill_id', nullable: true })
  openFillId: string | null;

  @Column({ type: 'uuid', name: 'close_fill_id', nullable: true })
  closeFillId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
