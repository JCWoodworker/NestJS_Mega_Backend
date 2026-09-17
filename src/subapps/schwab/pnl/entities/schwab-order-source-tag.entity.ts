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
 *
 * The primary key is composite because Schwab order ids are only unique
 * within an account. On a single-account deployment `order_id` alone was
 * fine; across tenants, two users' orders could collide and one would
 * silently overwrite the other's provenance tag — mislabelling a manual
 * trade as a bot trade, or vice versa, in the history view.
 */
@Entity('schwab_order_source_tags')
@Index(['accountHash'])
export class SchwabOrderSourceTag {
  @PrimaryColumn({ type: 'varchar', length: 64, name: 'order_id' })
  orderId: string;

  @PrimaryColumn({ type: 'varchar', length: 64, name: 'account_hash' })
  accountHash: string;

  @Column({
    type: 'enum',
    enum: OrderSource,
  })
  source: OrderSource;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
