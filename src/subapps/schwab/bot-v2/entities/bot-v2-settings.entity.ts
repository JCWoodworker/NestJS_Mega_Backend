import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { BotCombineMode, BotStrategy } from '@schwab/bot/enums/strategy.enum';

import { SignalBarSeconds } from '../bot-v2-bars.util';
import { BotV2Underlying } from '../bot-v2-config.util';

const decimal = {
  to: (value: number | null) => value,
  from: (value: string | null) => (value == null ? null : Number(value)),
};

@Entity('bot_v2_settings')
export class BotV2Settings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('UQ_bot_v2_settings_user_id', { unique: true })
  @Column({ type: 'varchar', name: 'user_id' })
  userId: string;

  @Column({
    type: 'jsonb',
    name: 'strategies_enabled',
    default: () => `'["VWAP_PULLBACK","ORB_5M"]'`,
  })
  strategiesEnabled: BotStrategy[];

  @Column({ type: 'int', name: 'min_strategy_agreement', default: 1 })
  minStrategyAgreement: number;

  @Column({ type: 'boolean', name: 'calls_enabled', default: true })
  callsEnabled: boolean;

  @Column({ type: 'boolean', name: 'puts_enabled', default: true })
  putsEnabled: boolean;

  @Column({ type: 'boolean', name: 'can_buy_calls', default: true })
  canBuyCalls: boolean;

  @Column({ type: 'boolean', name: 'can_buy_puts', default: true })
  canBuyPuts: boolean;

  @Column({ type: 'varchar', name: 'combine_mode', default: BotCombineMode.ANY })
  combineMode: BotCombineMode;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    name: 'risk_pct',
    default: 10,
    transformer: decimal,
  })
  riskPct: number;

  @Column({ type: 'boolean', name: 'use_risk_at_stop', default: false })
  useRiskAtStop: boolean;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'max_risk_usd',
    default: 200,
    transformer: decimal,
  })
  maxRiskUsd: number;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    name: 'min_premium',
    default: 0.6,
    transformer: decimal,
  })
  minPremium: number;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    name: 'max_premium',
    default: 2.5,
    transformer: decimal,
  })
  maxPremium: number;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    name: 'max_spread_pct',
    default: 5,
    transformer: decimal,
  })
  maxSpreadPct: number;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    name: 'delta_min',
    default: 0.4,
    transformer: decimal,
  })
  deltaMin: number;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    name: 'delta_max',
    default: 0.6,
    transformer: decimal,
  })
  deltaMax: number;

  @Column({ type: 'varchar', length: 5, name: 'trade_window_start', default: '09:30' })
  tradeWindowStart: string;

  @Column({ type: 'varchar', length: 5, name: 'trade_window_end', default: '15:00' })
  tradeWindowEnd: string;

  @Column({ type: 'varchar', length: 5, name: 'hard_flatten_time', default: '15:30' })
  hardFlattenTime: string;

  @Column({ type: 'integer', name: 'cooldown_mins', default: 2 })
  cooldownMins: number;

  @Column({ type: 'integer', name: 'atr_period', default: 14 })
  atrPeriod: number;

  @Column({ type: 'boolean', name: 'use_premium_stop', default: true })
  usePremiumStop: boolean;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    name: 'premium_stop_pct',
    default: 25,
    transformer: decimal,
  })
  premiumStopPct: number;

  @Column({ type: 'boolean', name: 'use_premium_target', default: true })
  usePremiumTarget: boolean;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    name: 'premium_target_pct',
    default: 22,
    transformer: decimal,
  })
  premiumTargetPct: number;

  @Column({ type: 'boolean', name: 'use_trail_stop', default: true })
  useTrailStop: boolean;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    name: 'trail_arm_pct',
    default: 8,
    transformer: decimal,
  })
  trailArmPct: number;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    name: 'trail_pct',
    default: 15,
    transformer: decimal,
  })
  trailPct: number;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    name: 'trail_min_lock_pct',
    default: 5,
    transformer: decimal,
  })
  trailMinLockPct: number;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    name: 'stop_atr_mult',
    default: 1.5,
    transformer: decimal,
  })
  stopAtrMult: number;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    name: 'target_atr_mult',
    default: 1.8,
    transformer: decimal,
  })
  targetAtrMult: number;

  @Column({ type: 'integer', name: 'paper_slippage_cents', default: 1 })
  paperSlippageCents: number;

  @Column({ type: 'integer', name: 'signal_bar_seconds', default: 60 })
  signalBarSeconds: SignalBarSeconds;

  @Column({ type: 'boolean', name: 'use_scale_out', default: false })
  useScaleOut: boolean;

  @Column({ type: 'varchar', name: 'bot_underlying', default: 'SPY' })
  botUnderlying: BotV2Underlying;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
