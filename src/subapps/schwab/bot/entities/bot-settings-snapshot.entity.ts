import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { BotSettingsTier } from '../enums/bot-event-type.enum';

/**
 * How a settings change was applied.
 *
 * `suggested` = FE/Nest Apply suggested path (James's only operator path).
 * `manual` = PUT /bot/settings without that tag (form Save — rare for James).
 * `bootstrap` = first row create / backfill baseline.
 */
export enum BotSettingsSnapshotSource {
  SUGGESTED = 'suggested',
  MANUAL = 'manual',
  BOOTSTRAP = 'bootstrap',
}

/**
 * Append-only settings history for weekly rollups.
 *
 * Distinct from `bot_events` OPERATOR_SETTINGS (30-day trim): this table is
 * durable so P&L can be attributed to the settings in force during each
 * trading period. Never delete rows for corpus hygiene.
 */
@Entity('bot_settings_snapshots')
@Index(['userId', 'at'])
@Index(['userId', 'etDateKey'])
export class BotSettingsSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'user_id' })
  userId: string;

  /** When the settings became active (ms epoch stored as bigint string). */
  @Column({ type: 'bigint', name: 'at' })
  at: string;

  /** ET calendar day for joining against daily reports / trades. */
  @Column({ type: 'varchar', length: 10, name: 'et_date_key' })
  etDateKey: string;

  @Column({
    type: 'enum',
    enum: BotSettingsSnapshotSource,
    enumName: 'bot_settings_snapshots_source_enum',
  })
  source: BotSettingsSnapshotSource;

  /** Full settings view after the change (contract shape). */
  @Column({ type: 'jsonb' })
  settings: Record<string, unknown>;

  /** Partial patch that was applied (null on bootstrap). */
  @Column({ type: 'jsonb', nullable: true })
  patch: Record<string, unknown> | null;

  /** Equity used when source was suggested (null otherwise). */
  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    nullable: true,
  })
  equity: number | null;

  /** Tier at apply time when source was suggested. */
  @Column({
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  tier: BotSettingsTier | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
