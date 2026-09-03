import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBotTables1788456900002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "bot_settings_combine_mode_enum" AS ENUM ('CONFIRMING')
    `);
    await queryRunner.query(`
      CREATE TYPE "bot_state_mode_enum" AS ENUM ('MANUAL', 'BOT')
    `);
    await queryRunner.query(`
      CREATE TYPE "bot_state_lane_enum" AS ENUM ('BOT_PAPER', 'BOT_LIVE')
    `);

    await queryRunner.query(`
      CREATE TABLE "bot_settings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "vwap_pullback_enabled" boolean NOT NULL DEFAULT true,
        "orb_5m_enabled" boolean NOT NULL DEFAULT true,
        "combine_mode" "bot_settings_combine_mode_enum" NOT NULL DEFAULT 'CONFIRMING',
        "risk_pct" decimal(8,4) NOT NULL DEFAULT 10,
        "use_max_loss_usd" boolean NOT NULL DEFAULT false,
        "max_loss_usd" decimal(18,4),
        "use_max_loss_pct" boolean NOT NULL DEFAULT false,
        "max_loss_pct" decimal(8,4),
        "use_profit_usd" boolean NOT NULL DEFAULT false,
        "profit_usd" decimal(18,4),
        "use_profit_pct_day_start" boolean NOT NULL DEFAULT false,
        "profit_pct_day_start" decimal(8,4),
        "use_profit_pct_current" boolean NOT NULL DEFAULT false,
        "profit_pct_current" decimal(8,4),
        "min_premium" decimal(8,4) NOT NULL DEFAULT 0.60,
        "max_premium" decimal(8,4) NOT NULL DEFAULT 2.50,
        "max_spread_pct" decimal(8,4) NOT NULL DEFAULT 5,
        "delta_min" decimal(8,4) NOT NULL DEFAULT 0.40,
        "delta_max" decimal(8,4) NOT NULL DEFAULT 0.60,
        "trade_window_start" varchar(5) NOT NULL DEFAULT '10:00',
        "trade_window_end" varchar(5) NOT NULL DEFAULT '15:00',
        "hard_flatten_time" varchar(5) NOT NULL DEFAULT '15:30',
        "cooldown_mins" integer NOT NULL DEFAULT 30,
        "atr_period" integer NOT NULL DEFAULT 14,
        "paper_slippage_cents" integer NOT NULL DEFAULT 1,
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bot_settings" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "bot_state" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "mode" "bot_state_mode_enum" NOT NULL DEFAULT 'MANUAL',
        "lane" "bot_state_lane_enum",
        "running" boolean NOT NULL DEFAULT false,
        "lockout" boolean NOT NULL DEFAULT false,
        "lockout_reason" text,
        "live_armed" boolean NOT NULL DEFAULT false,
        "paper_equity" decimal(18,4) NOT NULL DEFAULT 1000,
        "paper_settled_cash" decimal(18,4) NOT NULL DEFAULT 1000,
        "paper_day_start_equity" decimal(18,4) NOT NULL DEFAULT 1000,
        "open_position" jsonb,
        "last_signal" jsonb,
        "last_error" text,
        "last_trade_at" TIMESTAMPTZ,
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bot_state" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "bot_state"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bot_settings"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bot_state_lane_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bot_state_mode_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "bot_settings_combine_mode_enum"`,
    );
  }
}
