import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { BotLane } from '../enums/bot-lane.enum';

/**
 * Sampled price path while a bot position is open — the raw material for
 * max-favorable-excursion and "what would the ideal exit have been".
 *
 * This cannot be reconstructed after the fact: Schwab price history returns
 * last-trade OHLC while the bot exits on the *bid*, and 0DTE contracts expire
 * the same session. The soft-exit loop already reads the bid every heartbeat,
 * so recording it here costs zero additional Schwab calls.
 *
 * Deliberately stores raw observations only. Distance to each trigger is
 * derivable from the levels stamped on `bot_trades`, so storing it here would
 * duplicate data on the highest-volume table in the system.
 */
@Entity('bot_trade_tape')
@Index(['userId', 'tradeKey', 'at'])
export class BotTradeTape {
  @PrimaryGeneratedColumn()
  id: number;

  /** Owner-only in practice — see the note on `BotTrade.userId`. Part of the
   * index because `recordTradeClose` reads the tape back by trade key to
   * compute excursion, and must not mix in another account's samples. */
  @Column({ type: 'varchar', name: 'user_id' })
  userId: string;

  /** `${symbol}-${openedAt}` — stable for the life of one position. */
  @Column({ type: 'varchar', length: 64, name: 'trade_key' })
  tradeKey: string;

  @Column({ type: 'bigint', name: 'at' })
  at: string; // epoch ms — bigint round-trips as string via the pg driver

  @Column({ type: 'varchar', length: 32 })
  symbol: string;

  @Column({ type: 'enum', enum: BotLane })
  lane: BotLane;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 4,
    name: 'option_bid',
    nullable: true,
  })
  optionBid: number | null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 4,
    name: 'option_ask',
    nullable: true,
  })
  optionAsk: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  spot: number | null;
}
