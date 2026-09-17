import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Positional encoding of one contract in a snapshot:
 *
 *   [strike, right, delta, bid, ask]
 *
 * where `right` is 0 for CALL and 1 for PUT. Positional tuples rather than
 * objects because repeating the key names across ~32 contracts every minute of
 * every session *is* the storage cost — this form is roughly 3–4x smaller and
 * the field order is fixed here so it stays readable.
 */
export type ChainSnapshotQuote = [
  strike: number,
  right: 0 | 1,
  delta: number | null,
  bid: number | null,
  ask: number | null,
];

/**
 * The near-the-money option chain, captured once per minute for the whole
 * session, whether or not the bot is in a position or even trading.
 *
 * The entire value is having the chain at the minutes we *did not* act, so
 * entry counterfactuals ("should it have entered at 10:15?") become possible
 * later. That question cannot be answered retroactively: `/chains` only ever
 * returns the chain as of now, and delta — which is how the strike gets
 * picked — does not appear in price history at all.
 *
 * Analysis of this data is deliberately deferred; the recording is not,
 * because unrecorded history is unrecoverable.
 */
@Entity('bot_chain_snapshots')
@Index(['etDateKey', 'at'])
export class BotChainSnapshot {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint', name: 'at' })
  at: string; // epoch ms — bigint round-trips as string via the pg driver

  @Column({ type: 'varchar', length: 10, name: 'et_date_key' })
  etDateKey: string;

  /** ET wall clock `HH:MM` of the snapshot — cheap bucketing for
   * time-of-day studies without re-deriving the timezone per row. */
  @Column({ type: 'varchar', length: 5, name: 'et_hhmm' })
  etHhMm: string;

  @Column({ type: 'varchar', length: 16, name: 'underlying_symbol' })
  underlyingSymbol: string;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  spot: number | null;

  /** Expiration shared by every quote in `quotes` (the 0DTE ladder). */
  @Column({ type: 'varchar', length: 10, nullable: true })
  expiration: string | null;

  /** See `ChainSnapshotQuote` for the tuple layout. */
  @Column({ type: 'jsonb' })
  quotes: ChainSnapshotQuote[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
