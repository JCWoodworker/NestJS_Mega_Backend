import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { BotCombineMode } from '../enums/strategy.enum';

/** Singleton settings row — server is source of truth for bot knobs. */
@Entity('bot_settings')
export class BotSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'boolean', name: 'vwap_pullback_enabled', default: true })
  vwapPullbackEnabled: boolean;

  @Column({ type: 'boolean', name: 'orb_5m_enabled', default: true })
  orb5mEnabled: boolean;

  @Column({
    type: 'enum',
    enum: BotCombineMode,
    name: 'combine_mode',
    default: BotCombineMode.CONFIRMING,
  })
  combineMode: BotCombineMode;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    name: 'risk_pct',
    default: 10,
  })
  riskPct: number;

  @Column({ type: 'boolean', name: 'use_max_loss_usd', default: false })
  useMaxLossUsd: boolean;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'max_loss_usd',
    nullable: true,
  })
  maxLossUsd: number | null;

  @Column({ type: 'boolean', name: 'use_max_loss_pct', default: false })
  useMaxLossPct: boolean;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    name: 'max_loss_pct',
    nullable: true,
  })
  maxLossPct: number | null;

  @Column({ type: 'boolean', name: 'use_profit_usd', default: false })
  useProfitUsd: boolean;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'profit_usd',
    nullable: true,
  })
  profitUsd: number | null;

  @Column({
    type: 'boolean',
    name: 'use_profit_pct_day_start',
    default: false,
  })
  useProfitPctDayStart: boolean;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    name: 'profit_pct_day_start',
    nullable: true,
  })
  profitPctDayStart: number | null;

  @Column({
    type: 'boolean',
    name: 'use_profit_pct_current',
    default: false,
  })
  useProfitPctCurrent: boolean;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    name: 'profit_pct_current',
    nullable: true,
  })
  profitPctCurrent: number | null;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    name: 'min_premium',
    default: 0.6,
  })
  minPremium: number;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    name: 'max_premium',
    default: 2.5,
  })
  maxPremium: number;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    name: 'max_spread_pct',
    default: 5,
  })
  maxSpreadPct: number;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    name: 'delta_min',
    default: 0.4,
  })
  deltaMin: number;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    name: 'delta_max',
    default: 0.6,
  })
  deltaMax: number;

  @Column({
    type: 'varchar',
    length: 5,
    name: 'trade_window_start',
    default: '10:00',
  })
  tradeWindowStart: string;

  @Column({
    type: 'varchar',
    length: 5,
    name: 'trade_window_end',
    default: '15:00',
  })
  tradeWindowEnd: string;

  @Column({
    type: 'varchar',
    length: 5,
    name: 'hard_flatten_time',
    default: '15:30',
  })
  hardFlattenTime: string;

  @Column({ type: 'integer', name: 'cooldown_mins', default: 30 })
  cooldownMins: number;

  @Column({ type: 'integer', name: 'atr_period', default: 14 })
  atrPeriod: number;

  @Column({ type: 'integer', name: 'paper_slippage_cents', default: 1 })
  paperSlippageCents: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
