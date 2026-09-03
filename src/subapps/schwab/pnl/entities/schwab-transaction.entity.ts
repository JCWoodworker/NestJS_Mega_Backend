import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { TransactionCategory } from '../enums/transaction-category.enum';
import { TransactionSource } from '../enums/transaction-source.enum';

@Entity('schwab_transactions')
@Index(['accountHash', 'schwabTransactionId'], {
  unique: true,
  where: '"schwab_transaction_id" IS NOT NULL',
})
@Index(['accountHash', 'transactionDate'])
@Index(['accountHash', 'category'])
export class SchwabTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, name: 'account_hash' })
  accountHash: string;

  @Column({
    type: 'varchar',
    length: 64,
    name: 'schwab_transaction_id',
    nullable: true,
  })
  schwabTransactionId: string | null;

  @Column({
    type: 'enum',
    enum: TransactionCategory,
  })
  category: TransactionCategory;

  @Column({ type: 'varchar', length: 64, name: 'schwab_type', nullable: true })
  schwabType: string | null;

  @Column({
    type: 'enum',
    enum: TransactionSource,
    default: TransactionSource.SCHWAB_SYNC,
  })
  source: TransactionSource;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'net_amount',
  })
  netAmount: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  symbol: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'timestamptz', name: 'transaction_date' })
  transactionDate: Date;

  @Column({ type: 'jsonb', nullable: true })
  raw: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
