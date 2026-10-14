import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * One desk-sim fill. Keyed by the signed-in user, not a Schwab account, so a
 * practice trader with no brokerage connection still has a history.
 * `clientId` is the browser's fill id; posting the same id again updates it.
 */
@Entity('schwab_paper_fills')
@Index(['userId', 'clientId'], { unique: true })
@Index(['userId', 'at'])
export class SchwabPaperFill {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 128, name: 'client_id' })
  clientId: string;

  @Column({ type: 'varchar', length: 64 })
  symbol: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  quantity: number;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  price: number;

  @Column({ type: 'timestamptz' })
  at: Date;

  @Column({ type: 'varchar', length: 8 })
  side: 'OPEN' | 'CLOSE';

  @Column({ type: 'varchar', length: 16, name: 'order_type' })
  orderType: 'MARKET' | 'STOP';

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 6,
    name: 'open_price',
    nullable: true,
  })
  openPrice: number | null;

  @Column({ type: 'timestamptz', name: 'opened_at', nullable: true })
  openedAt: Date | null;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'realized_pnl',
    nullable: true,
  })
  realizedPnl: number | null;

  @Column({ type: 'varchar', length: 16, name: 'exit_reason', nullable: true })
  exitReason: 'SELL' | 'FLATTEN' | 'STOP' | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
