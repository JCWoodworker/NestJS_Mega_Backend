import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { OrderSource } from '../enums/order-source.enum';

@Entity('schwab_order_history')
@Index(['accountHash', 'orderId'], { unique: true })
@Index(['accountHash', 'enteredTime'])
export class SchwabOrderHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, name: 'account_hash' })
  accountHash: string;

  @Column({ type: 'varchar', length: 64, name: 'order_id' })
  orderId: string;

  @Column({ type: 'varchar', length: 64 })
  symbol: string;

  @Column({ type: 'varchar', length: 32 })
  instruction: string;

  @Column({ type: 'varchar', length: 32, name: 'order_type' })
  orderType: string;

  @Column({ type: 'varchar', length: 32 })
  status: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  quantity: number;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 6,
    name: 'filled_quantity',
  })
  filledQuantity: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  price: number | null;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 6,
    name: 'stop_price',
    nullable: true,
  })
  stopPrice: number | null;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 6,
    name: 'average_fill_price',
    nullable: true,
  })
  averageFillPrice: number | null;

  @Column({ type: 'timestamptz', name: 'entered_time', nullable: true })
  enteredTime: Date | null;

  @Column({ type: 'timestamptz', name: 'closed_at', nullable: true })
  closedAt: Date | null;

  @Column({
    type: 'enum',
    enum: OrderSource,
    default: OrderSource.MANUAL_LIVE,
  })
  source: OrderSource;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
