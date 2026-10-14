import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

const decimal = {
  to: (value: number | null) => value,
  from: (value: string | null) => (value == null ? null : Number(value)),
};

/** A known balance or cash added. Never a trading gain. */
@Entity('calendar_capital_events')
@Index(['userId', 'book', 'at'])
export class CalendarCapitalEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar' })
  book: string;

  @Column({ type: 'varchar' })
  kind: 'BASELINE' | 'TOP_UP';

  @Column({ type: 'varchar', length: 10, name: 'et_date_key' })
  etDateKey: string;

  @Column({ type: 'timestamptz' })
  at: Date;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'balance_before',
    nullable: true,
    transformer: decimal,
  })
  balanceBefore: number | null;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'balance_after',
    transformer: decimal,
  })
  balanceAfter: number;

  @Column({ type: 'decimal', precision: 18, scale: 4, transformer: decimal })
  amount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
