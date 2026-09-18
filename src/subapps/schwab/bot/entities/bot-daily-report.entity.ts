import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * One row per ET session per user — the analyzer's output.
 *
 * Stores the aggregates rather than recomputing them, so week/month/quarter
 * views can be rebuilt without replaying the tape. Period totals must sum
 * `net_pnl` across these rows instead of diffing balances, which is exactly
 * what breaks when a capital reset lands mid-period.
 *
 * `et_date_key` is part of the primary key so a re-run overwrites the day
 * rather than appending a second, divergent verdict for it.
 */
@Entity('bot_daily_reports')
@Index(['userId', 'etDateKey'])
export class BotDailyReport {
  @PrimaryColumn({ type: 'varchar', name: 'user_id' })
  userId: string;

  @PrimaryColumn({ type: 'varchar', length: 10, name: 'et_date_key' })
  etDateKey: string;

  @Column({ type: 'int', default: 0 })
  trades: number;

  /** Cumulative trade count at the time of the run, for the readiness gate. */
  @Column({ type: 'int', name: 'cumulative_trades', default: 0 })
  cumulativeTrades: number;

  @Column({ type: 'varchar', length: 16, name: 'readiness_level' })
  readinessLevel: string;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'gross_pnl',
    default: 0,
  })
  grossPnl: number;

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  fees: number;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'net_pnl',
    default: 0,
  })
  netPnl: number;

  /** Full aggregate + policy grid, kept whole so later questions need no re-run. */
  @Column({ type: 'jsonb', name: 'aggregate' })
  aggregate: unknown;

  @Column({ type: 'jsonb', name: 'policy_results', nullable: true })
  policyResults: unknown;

  /** Rendered report — what the nightly agent reads. */
  @Column({ type: 'text', name: 'markdown' })
  markdown: string;

  @Column({ type: 'timestamptz', name: 'generated_at' })
  generatedAt: Date;
}
