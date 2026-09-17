import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recording layer for the daily bot improvement loop.
 *
 * These tables exist because the data they hold is unrecoverable after the
 * fact: Schwab serves last-trade OHLC rather than the bid the bot exits on,
 * `/chains` has no "as of" parameter, and 0DTE contracts expire the same day.
 * They are also deliberately exempt from the 30-day `bot_events` trim, since
 * quarter and year views need a durable substrate.
 */
export class CreateBotAnalyticsTables1788800000000
  implements MigrationInterface
{
  name = 'CreateBotAnalyticsTables1788800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "bot_trade_tape_lane_enum" AS ENUM ('BOT_PAPER', 'BOT_LIVE')
    `);
    await queryRunner.query(`
      CREATE TYPE "bot_trades_lane_enum" AS ENUM ('BOT_PAPER', 'BOT_LIVE')
    `);
    await queryRunner.query(`
      CREATE TYPE "bot_trades_direction_enum" AS ENUM ('CALL', 'PUT')
    `);
    await queryRunner.query(`
      CREATE TYPE "bot_capital_events_lane_enum" AS ENUM ('BOT_PAPER', 'BOT_LIVE')
    `);
    await queryRunner.query(`
      CREATE TYPE "bot_capital_events_reason_enum" AS ENUM ('FLOOR_RESET', 'MANUAL_RESET')
    `);

    // Sampled bid path while a position is open. Highest-volume table, so it
    // stores raw observations only — trigger distances are derivable.
    await queryRunner.query(`
      CREATE TABLE "bot_trade_tape" (
        "id" SERIAL NOT NULL,
        "trade_key" varchar(64) NOT NULL,
        "at" bigint NOT NULL,
        "symbol" varchar(32) NOT NULL,
        "lane" "bot_trade_tape_lane_enum" NOT NULL,
        "option_bid" decimal(12,4),
        "option_ask" decimal(12,4),
        "spot" decimal(12,4),
        CONSTRAINT "PK_bot_trade_tape" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_bot_trade_tape_key_at" ON "bot_trade_tape" ("trade_key", "at")
    `);

    // One row per completed round trip. Enriches schwab_realized_trades rather
    // than replacing it; joined on a natural key because rebuildForAccount()
    // deletes and recreates realized rows, so their ids are not stable.
    await queryRunner.query(`
      CREATE TABLE "bot_trades" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "trade_key" varchar(64) NOT NULL,
        "et_date_key" varchar(10) NOT NULL,
        "lane" "bot_trades_lane_enum" NOT NULL,
        "symbol" varchar(32) NOT NULL,
        "direction" "bot_trades_direction_enum",
        "quantity" integer NOT NULL,
        "opened_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "closed_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "hold_ms" integer NOT NULL,
        "entry_price" decimal(12,4) NOT NULL,
        "exit_price" decimal(12,4) NOT NULL,
        "entry_underlying" decimal(12,4),
        "exit_underlying" decimal(12,4),
        "gross_pnl" decimal(18,4) NOT NULL,
        "fees" decimal(18,4) NOT NULL,
        "net_pnl" decimal(18,4) NOT NULL,
        "mfe_premium" decimal(12,4),
        "mae_premium" decimal(12,4),
        "time_to_mfe_ms" integer,
        "capture_efficiency" decimal(8,4),
        "sample_count" integer NOT NULL DEFAULT 0,
        "stop_premium" decimal(12,4),
        "target_premium" decimal(12,4),
        "stop_underlying" decimal(12,4),
        "target_underlying" decimal(12,4),
        "atr_used" decimal(12,4),
        "strategies" jsonb,
        "entry_reason" text,
        "exit_reason" text,
        "config_version" varchar(64),
        "regime" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bot_trades" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_bot_trades_trade_key" UNIQUE ("trade_key")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_bot_trades_et_date_key" ON "bot_trades" ("et_date_key")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_bot_trades_closed_at" ON "bot_trades" ("closed_at")
    `);

    // SPY 1m bars, one row per session, backfilled after the close.
    await queryRunner.query(`
      CREATE TABLE "bot_market_days" (
        "et_date_key" varchar(10) NOT NULL,
        "symbol" varchar(16) NOT NULL,
        "bars" jsonb NOT NULL,
        "bar_count" integer NOT NULL,
        "full_session" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bot_market_days" PRIMARY KEY ("et_date_key")
      )
    `);

    // Near-the-money chain once per minute, recorded whether or not the bot is
    // trading — the value is having the chain at minutes we did NOT act on.
    await queryRunner.query(`
      CREATE TABLE "bot_chain_snapshots" (
        "id" SERIAL NOT NULL,
        "at" bigint NOT NULL,
        "et_date_key" varchar(10) NOT NULL,
        "et_hhmm" varchar(5) NOT NULL,
        "underlying_symbol" varchar(16) NOT NULL,
        "spot" decimal(12,4),
        "expiration" varchar(10),
        "quotes" jsonb NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bot_chain_snapshots" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_bot_chain_snapshots_date_at" ON "bot_chain_snapshots" ("et_date_key", "at")
    `);

    // Capital injection ledger. Without it the equity curve cannot distinguish
    // a $2,200 gain from a $2,200 top-up after a floor reset.
    await queryRunner.query(`
      CREATE TABLE "bot_capital_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "et_date_key" varchar(10) NOT NULL,
        "lane" "bot_capital_events_lane_enum",
        "reason" "bot_capital_events_reason_enum" NOT NULL,
        "balance_before" decimal(18,4) NOT NULL,
        "balance_after" decimal(18,4) NOT NULL,
        "amount" decimal(18,4) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bot_capital_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_bot_capital_events_at" ON "bot_capital_events" ("at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "bot_capital_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bot_chain_snapshots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bot_market_days"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bot_trades"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bot_trade_tape"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "bot_capital_events_reason_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "bot_capital_events_lane_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "bot_trades_direction_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bot_trades_lane_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bot_trade_tape_lane_enum"`);
  }
}
