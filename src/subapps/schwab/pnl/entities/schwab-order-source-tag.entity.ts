import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

import { OrderSource } from '../enums/order-source.enum';

/**
 * Maps a Schwab (or paper) orderId to the app-side source that placed it.
 * OrderUpdatesService / TransactionSyncService look this up because Schwab's
 * order payload carries no app tag.
 */
@Entity('schwab_order_source_tags')
@Index(['accountHash'])
export class SchwabOrderSourceTag {
  @PrimaryColumn({ type: 'varchar', length: 64, name: 'order_id' })
  orderId: string;

  @Column({ type: 'varchar', length: 64, name: 'account_hash' })
  accountHash: string;

  @Column({
    type: 'enum',
    enum: OrderSource,
  })
  source: OrderSource;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
