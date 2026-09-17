import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Positional encoding of one 1m bar: `[chartTime, open, high, low, close, volume]`.
 * Same reasoning as the chain snapshots — 390 bars a day of repeated key names
 * is pure overhead, and the field order is pinned here.
 */
export type MarketDayBar = [
  chartTime: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
];

/**
 * SPY 1m bars for one ET session, backfilled after the close.
 *
 * Unlike option data, the underlying *is* reliably recoverable after the fact
 * from Schwab price history, so this is never recorded live — the EOD job
 * fetches the whole session in one call. One row per day rather than per bar.
 *
 * Needed to replay indicator state (VWAP, ATR, opening range) at any past
 * minute, which the in-memory 100-bar ring buffer cannot provide.
 */
@Entity('bot_market_days')
export class BotMarketDay {
  /** ET calendar day, `YYYY-MM-DD`. */
  @PrimaryColumn({ type: 'varchar', length: 10, name: 'et_date_key' })
  etDateKey: string;

  @Column({ type: 'varchar', length: 16 })
  symbol: string;

  /** See `MarketDayBar` for the tuple layout. */
  @Column({ type: 'jsonb' })
  bars: MarketDayBar[];

  @Column({ type: 'int', name: 'bar_count' })
  barCount: number;

  /** False when the session was short (early close) or the backfill was
   * partial — a signal to the analyzer that this day is not directly
   * comparable to a full session. */
  @Column({ type: 'boolean', name: 'full_session', default: true })
  fullSession: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
