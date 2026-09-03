import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSchwabPnlTables1788456799648 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "schwab_transactions_category_enum" AS ENUM (
        'TRADE', 'TRANSFER_IN', 'TRANSFER_OUT', 'INCOME', 'FEE', 'OTHER'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "schwab_transactions_source_enum" AS ENUM (
        'SCHWAB_SYNC', 'MANUAL'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "schwab_trade_fills_asset_type_enum" AS ENUM (
        'EQUITY', 'OPTION'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "schwab_trade_fills_instruction_enum" AS ENUM (
        'BUY', 'SELL'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "schwab_trade_fills_position_effect_enum" AS ENUM (
        'OPENING', 'CLOSING'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "schwab_realized_trades_direction_enum" AS ENUM (
        'LONG', 'SHORT'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "schwab_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "account_hash" varchar(64) NOT NULL,
        "schwab_transaction_id" varchar(64),
        "category" "schwab_transactions_category_enum" NOT NULL,
        "schwab_type" varchar(64),
        "source" "schwab_transactions_source_enum" NOT NULL DEFAULT 'SCHWAB_SYNC',
        "net_amount" decimal(18,4) NOT NULL,
        "symbol" varchar(64),
        "description" text,
        "transaction_date" TIMESTAMPTZ NOT NULL,
        "raw" jsonb,
        "note" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_schwab_transactions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_schwab_transactions_account_schwab_id"
        ON "schwab_transactions" ("account_hash", "schwab_transaction_id")
        WHERE "schwab_transaction_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_schwab_transactions_account_date"
        ON "schwab_transactions" ("account_hash", "transaction_date")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_schwab_transactions_account_category"
        ON "schwab_transactions" ("account_hash", "category")
    `);

    await queryRunner.query(`
      CREATE TABLE "schwab_trade_fills" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "account_hash" varchar(64) NOT NULL,
        "schwab_transaction_id" varchar(64),
        "order_id" varchar(64),
        "symbol" varchar(64) NOT NULL,
        "asset_type" "schwab_trade_fills_asset_type_enum" NOT NULL,
        "instruction" "schwab_trade_fills_instruction_enum" NOT NULL,
        "quantity" decimal(18,6) NOT NULL,
        "price" decimal(18,6) NOT NULL,
        "amount" decimal(18,4) NOT NULL,
        "position_effect" "schwab_trade_fills_position_effect_enum",
        "transaction_date" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_schwab_trade_fills" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_schwab_trade_fills_account_symbol_date"
        ON "schwab_trade_fills" ("account_hash", "symbol", "transaction_date")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_schwab_trade_fills_account_tx"
        ON "schwab_trade_fills" ("account_hash", "schwab_transaction_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "schwab_realized_trades" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "account_hash" varchar(64) NOT NULL,
        "symbol" varchar(64) NOT NULL,
        "direction" "schwab_realized_trades_direction_enum" NOT NULL,
        "quantity" decimal(18,6) NOT NULL,
        "open_price" decimal(18,6) NOT NULL,
        "close_price" decimal(18,6) NOT NULL,
        "opened_at" TIMESTAMPTZ NOT NULL,
        "closed_at" TIMESTAMPTZ NOT NULL,
        "realized_pnl" decimal(18,4) NOT NULL,
        "open_fill_id" uuid,
        "close_fill_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_schwab_realized_trades" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_schwab_realized_trades_account_closed"
        ON "schwab_realized_trades" ("account_hash", "closed_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_schwab_realized_trades_account_symbol"
        ON "schwab_realized_trades" ("account_hash", "symbol")
    `);

    await queryRunner.query(`
      CREATE TABLE "schwab_daily_pnl" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "account_hash" varchar(64) NOT NULL,
        "date" date NOT NULL,
        "start_equity" decimal(18,4) NOT NULL,
        "end_equity" decimal(18,4) NOT NULL,
        "net_transfers" decimal(18,4) NOT NULL DEFAULT 0,
        "trading_pnl" decimal(18,4) NOT NULL DEFAULT 0,
        "realized_pnl" decimal(18,4) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_schwab_daily_pnl" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_schwab_daily_pnl_account_date"
        ON "schwab_daily_pnl" ("account_hash", "date")
    `);

    await queryRunner.query(`
      CREATE TABLE "schwab_order_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "account_hash" varchar(64) NOT NULL,
        "order_id" varchar(64) NOT NULL,
        "symbol" varchar(64) NOT NULL,
        "instruction" varchar(32) NOT NULL,
        "order_type" varchar(32) NOT NULL,
        "status" varchar(32) NOT NULL,
        "quantity" decimal(18,6) NOT NULL,
        "filled_quantity" decimal(18,6) NOT NULL,
        "price" decimal(18,6),
        "stop_price" decimal(18,6),
        "average_fill_price" decimal(18,6),
        "entered_time" TIMESTAMPTZ,
        "closed_at" TIMESTAMPTZ,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_schwab_order_history" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_schwab_order_history_account_order"
        ON "schwab_order_history" ("account_hash", "order_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_schwab_order_history_account_entered"
        ON "schwab_order_history" ("account_hash", "entered_time")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "schwab_order_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "schwab_daily_pnl"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "schwab_realized_trades"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "schwab_trade_fills"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "schwab_transactions"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "schwab_realized_trades_direction_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "schwab_trade_fills_position_effect_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "schwab_trade_fills_instruction_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "schwab_trade_fills_asset_type_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "schwab_transactions_source_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "schwab_transactions_category_enum"`,
    );
  }
}
