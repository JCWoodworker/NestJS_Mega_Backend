import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { BotLane } from '../enums/bot-lane.enum';
import { BotDirection, BotStrategy } from '../enums/strategy.enum';

/**
 * One row per completed bot round trip — the analytics fact table.
 *
 * This is an *enrichment layer*, not a second source of truth for P&L. Paper
 * and live round trips are already FIFO-matched into `schwab_realized_trades`;
 * what that ledger cannot tell you is how the trade behaved while it was open.
 * MFE, time-to-MFE, and capture efficiency are the numbers that answer "should
 * we have exited sooner", and they only exist here.
 *
 * Note it joins the realized ledger on a natural key rather than a foreign key:
 * `RealizedPnlService.rebuildForAccount()` deletes and recomputes every realized
 * row for an account on each exit, so those ids are not stable.
 *
 * Exempt from the 30-day `bot_events` trim — this table is the durable record
 * that makes quarter and year views possible.
 */
@Entity('bot_trades')
@Index(['userId', 'tradeKey'], { unique: true })
@Index(['etDateKey'])
@Index(['closedAt'])
export class BotTrade {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Only the improvement-loop owner writes here (see
   * `BotRecordingService.corpusUserId`), so this is defense in depth rather
   * than a routing key: it makes a gate regression detectable and the
   * offending rows removable, instead of indistinguishable from the owner's
   * own data once they have polluted the training set.
   */
  @Column({ type: 'varchar', name: 'user_id' })
  userId: string;

  /** `${symbol}-${openedAt}` — matches `bot_trade_tape.trade_key`. Unique per
   * user, not globally: two accounts can legitimately open the same contract
   * at the same millisecond. */
  @Column({ type: 'varchar', length: 64, name: 'trade_key' })
  tradeKey: string;

  /** ET calendar day of the close, for daily/period grouping. */
  @Column({ type: 'varchar', length: 10, name: 'et_date_key' })
  etDateKey: string;

  @Column({ type: 'enum', enum: BotLane })
  lane: BotLane;

  @Column({ type: 'varchar', length: 32 })
  symbol: string;

  @Column({ type: 'enum', enum: BotDirection, nullable: true })
  direction: BotDirection | null;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'timestamptz', name: 'opened_at' })
  openedAt: Date;

  @Column({ type: 'timestamptz', name: 'closed_at' })
  closedAt: Date;

  @Column({ type: 'int', name: 'hold_ms' })
  holdMs: number;

  // --- Prices ---------------------------------------------------------------

  @Column({ type: 'decimal', precision: 12, scale: 4, name: 'entry_price' })
  entryPrice: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, name: 'exit_price' })
  exitPrice: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 4,
    name: 'entry_underlying',
    nullable: true,
  })
  entryUnderlying: number | null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 4,
    name: 'exit_underlying',
    nullable: true,
  })
  exitUnderlying: number | null;

  // --- P&L ------------------------------------------------------------------

  /** `(exit - entry) * 100 * qty`, before costs. */
  @Column({ type: 'decimal', precision: 18, scale: 4, name: 'gross_pnl' })
  grossPnl: number;

  /** Modeled commission for both legs. */
  @Column({ type: 'decimal', precision: 18, scale: 4 })
  fees: number;

  /** `grossPnl - fees`. The number every period aggregate sums. */
  @Column({ type: 'decimal', precision: 18, scale: 4, name: 'net_pnl' })
  netPnl: number;

  // --- Excursion metrics (from the tape) ------------------------------------

  /** Best bid seen while open. */
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 4,
    name: 'mfe_premium',
    nullable: true,
  })
  mfePremium: number | null;

  /** Worst bid seen while open. */
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 4,
    name: 'mae_premium',
    nullable: true,
  })
  maePremium: number | null;

  /** Milliseconds from entry to the best bid. If this is far below `holdMs`
   * across many trades, the fix is a time stop or a trailing stop. */
  @Column({ type: 'int', name: 'time_to_mfe_ms', nullable: true })
  timeToMfeMs: number | null;

  /** Realized gain divided by the best gain available: how much of the move
   * we actually captured. The headline "money left on the table" metric. */
  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    name: 'capture_efficiency',
    nullable: true,
  })
  captureEfficiency: number | null;

  /** Tape rows backing the metrics above — a data-quality signal. A trade with
   * very few samples had a gappy bid feed and its MFE is not trustworthy. */
  @Column({ type: 'int', name: 'sample_count', default: 0 })
  sampleCount: number;

  // --- The plan that was in force -------------------------------------------

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 4,
    name: 'stop_premium',
    nullable: true,
  })
  stopPremium: number | null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 4,
    name: 'target_premium',
    nullable: true,
  })
  targetPremium: number | null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 4,
    name: 'stop_underlying',
    nullable: true,
  })
  stopUnderlying: number | null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 4,
    name: 'target_underlying',
    nullable: true,
  })
  targetUnderlying: number | null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 4,
    name: 'atr_used',
    nullable: true,
  })
  atrUsed: number | null;

  // --- Attribution ----------------------------------------------------------

  @Column({ type: 'jsonb', nullable: true })
  strategies: BotStrategy[] | null;

  @Column({ type: 'text', name: 'entry_reason', nullable: true })
  entryReason: string | null;

  /** `PREMIUM_STOP`, `UNDERLYING_TARGET`, `HARD_FLATTEN_EOD`, etc. */
  @Column({ type: 'text', name: 'exit_reason', nullable: true })
  exitReason: string | null;

  /** Hash of the settings in force, so a later analysis can attribute results
   * to the configuration that produced them. */
  @Column({
    type: 'varchar',
    length: 64,
    name: 'config_version',
    nullable: true,
  })
  configVersion: string | null;

  /** Regime tags for the session (ORB width, trend/chop, gap). */
  @Column({ type: 'jsonb', nullable: true })
  regime: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
