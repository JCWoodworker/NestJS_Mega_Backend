import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { FillAssetType } from '../enums/fill-asset-type.enum';
import { FillInstruction } from '../enums/fill-instruction.enum';
import { PositionEffect } from '../enums/position-effect.enum';

@Entity('schwab_trade_fills')
@Index(['accountHash', 'symbol', 'transactionDate'])
@Index(['accountHash', 'schwabTransactionId'])
export class SchwabTradeFill {
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

  @Column({ type: 'varchar', length: 64, name: 'order_id', nullable: true })
  orderId: string | null;

  @Column({ type: 'varchar', length: 64 })
  symbol: string;

  @Column({
    type: 'enum',
    enum: FillAssetType,
    name: 'asset_type',
  })
  assetType: FillAssetType;

  @Column({
    type: 'enum',
    enum: FillInstruction,
  })
  instruction: FillInstruction;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  quantity: number;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  price: number;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  amount: number;

  @Column({
    type: 'enum',
    enum: PositionEffect,
    name: 'position_effect',
    nullable: true,
  })
  positionEffect: PositionEffect | null;

  @Column({ type: 'timestamptz', name: 'transaction_date' })
  transactionDate: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
