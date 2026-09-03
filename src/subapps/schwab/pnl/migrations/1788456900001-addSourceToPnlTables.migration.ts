import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSourceToPnlTables1788456900001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "schwab_order_source_enum" AS ENUM (
        'MANUAL_LIVE', 'MANUAL_PAPER', 'BOT_LIVE', 'BOT_PAPER'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "schwab_trade_fills"
        ADD COLUMN "source" "schwab_order_source_enum" NOT NULL DEFAULT 'MANUAL_LIVE'
    `);
    await queryRunner.query(`
      ALTER TABLE "schwab_realized_trades"
        ADD COLUMN "source" "schwab_order_source_enum" NOT NULL DEFAULT 'MANUAL_LIVE'
    `);
    await queryRunner.query(`
      ALTER TABLE "schwab_order_history"
        ADD COLUMN "source" "schwab_order_source_enum" NOT NULL DEFAULT 'MANUAL_LIVE'
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_schwab_trade_fills_account_source"
        ON "schwab_trade_fills" ("account_hash", "source")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_schwab_realized_trades_account_source_closed"
        ON "schwab_realized_trades" ("account_hash", "source", "closed_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_schwab_order_history_account_source"
        ON "schwab_order_history" ("account_hash", "source")
    `);

    await queryRunner.query(`
      CREATE TABLE "schwab_order_source_tags" (
        "order_id" varchar(64) NOT NULL,
        "account_hash" varchar(64) NOT NULL,
        "source" "schwab_order_source_enum" NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_schwab_order_source_tags" PRIMARY KEY ("order_id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_schwab_order_source_tags_account"
        ON "schwab_order_source_tags" ("account_hash")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_schwab_order_source_tags_account"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "schwab_order_source_tags"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_schwab_order_history_account_source"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_schwab_realized_trades_account_source_closed"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_schwab_trade_fills_account_source"`,
    );
    await queryRunner.query(
      `ALTER TABLE "schwab_order_history" DROP COLUMN IF EXISTS "source"`,
    );
    await queryRunner.query(
      `ALTER TABLE "schwab_realized_trades" DROP COLUMN IF EXISTS "source"`,
    );
    await queryRunner.query(
      `ALTER TABLE "schwab_trade_fills" DROP COLUMN IF EXISTS "source"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "schwab_order_source_enum"`);
  }
}
