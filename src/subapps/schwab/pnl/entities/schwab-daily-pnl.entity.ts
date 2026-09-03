import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('schwab_daily_pnl')
@Index(['accountHash', 'date'], { unique: true })
export class SchwabDailyPnl {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, name: 'account_hash' })
  accountHash: string;

  /** America/New_York calendar date as YYYY-MM-DD. */
  @Column({ type: 'date' })
  date: string;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'start_equity',
  })
  startEquity: number;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'end_equity',
  })
  endEquity: number;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'net_transfers',
    default: 0,
  })
  netTransfers: number;

  /** endEquity - startEquity - netTransfers */
  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'trading_pnl',
    default: 0,
  })
  tradingPnl: number;

  /** Sum of schwab_realized_trades closed that day (cross-check). */
  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'realized_pnl',
    default: 0,
  })
  realizedPnl: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
