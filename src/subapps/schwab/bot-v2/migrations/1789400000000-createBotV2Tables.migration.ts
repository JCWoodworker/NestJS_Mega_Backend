import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBotV2Tables1789400000000 implements MigrationInterface {
  name = 'CreateBotV2Tables1789400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "bot_v2_settings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" character varying NOT NULL,
        "strategies_enabled" jsonb NOT NULL DEFAULT '["VWAP_PULLBACK","ORB_5M"]',
        "min_strategy_agreement" integer NOT NULL DEFAULT 1,
        "calls_enabled" boolean NOT NULL DEFAULT true,
        "puts_enabled" boolean NOT NULL DEFAULT true,
        "can_buy_calls" boolean NOT NULL DEFAULT true,
        "can_buy_puts" boolean NOT NULL DEFAULT true,
        "combine_mode" character varying NOT NULL DEFAULT 'ANY',
        "risk_pct" numeric(8,4) NOT NULL DEFAULT 10,
        "use_risk_at_stop" boolean NOT NULL DEFAULT false,
        "max_risk_usd" numeric(18,4) NOT NULL DEFAULT 200,
        "min_premium" numeric(8,4) NOT NULL DEFAULT 0.6,
        "max_premium" numeric(8,4) NOT NULL DEFAULT 2.5,
        "max_spread_pct" numeric(8,4) NOT NULL DEFAULT 5,
        "delta_min" numeric(8,4) NOT NULL DEFAULT 0.4,
        "delta_max" numeric(8,4) NOT NULL DEFAULT 0.6,
        "trade_window_start" character varying(5) NOT NULL DEFAULT '09:30',
        "trade_window_end" character varying(5) NOT NULL DEFAULT '15:00',
        "hard_flatten_time" character varying(5) NOT NULL DEFAULT '15:30',
        "cooldown_mins" integer NOT NULL DEFAULT 2,
        "atr_period" integer NOT NULL DEFAULT 14,
        "use_premium_stop" boolean NOT NULL DEFAULT true,
        "premium_stop_pct" numeric(8,4) NOT NULL DEFAULT 25,
        "use_premium_target" boolean NOT NULL DEFAULT true,
        "premium_target_pct" numeric(8,4) NOT NULL DEFAULT 22,
        "use_trail_stop" boolean NOT NULL DEFAULT true,
        "trail_arm_pct" numeric(8,4) NOT NULL DEFAULT 8,
        "trail_pct" numeric(8,4) NOT NULL DEFAULT 15,
        "trail_min_lock_pct" numeric(8,4) NOT NULL DEFAULT 5,
        "stop_atr_mult" numeric(8,4) NOT NULL DEFAULT 1.5,
        "target_atr_mult" numeric(8,4) NOT NULL DEFAULT 1.8,
        "paper_slippage_cents" integer NOT NULL DEFAULT 1,
        "signal_bar_seconds" integer NOT NULL DEFAULT 60,
        "use_scale_out" boolean NOT NULL DEFAULT false,
        "bot_underlying" character varying NOT NULL DEFAULT 'SPY',
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bot_v2_settings" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_bot_v2_settings_user_id" UNIQUE ("user_id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "bot_v2_state" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" character varying NOT NULL,
        "mode" character varying NOT NULL DEFAULT 'MANUAL',
        "running" boolean NOT NULL DEFAULT false,
        "lockout" boolean NOT NULL DEFAULT false,
        "lockout_reason" text,
        "paper_equity" numeric(18,4) NOT NULL DEFAULT 10000,
        "paper_settled_cash" numeric(18,4) NOT NULL DEFAULT 10000,
        "open_position" jsonb,
        "last_trade_at" TIMESTAMP WITH TIME ZONE,
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bot_v2_state" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_bot_v2_state_user_id" UNIQUE ("user_id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "bot_v2_trades" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" character varying NOT NULL,
        "position_id" character varying NOT NULL,
        "symbol" character varying NOT NULL,
        "underlying" character varying NOT NULL,
        "direction" character varying NOT NULL,
        "quantity" integer NOT NULL,
        "entry_price" numeric(18,4) NOT NULL,
        "exit_price" numeric(18,4) NOT NULL,
        "exit_reason" character varying NOT NULL,
        "gross_pnl" numeric(18,4) NOT NULL,
        "fees" numeric(18,4) NOT NULL,
        "net_pnl" numeric(18,4) NOT NULL,
        "opened_at" bigint NOT NULL,
        "closed_at" bigint NOT NULL,
        "signal_bar_seconds" integer NOT NULL,
        "config_version" character varying NOT NULL,
        "decision_latency_ms" integer,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bot_v2_trades" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_bot_v2_trades_user_id" ON "bot_v2_trades" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bot_v2_trades_position_id" ON "bot_v2_trades" ("position_id")`,
    );
    await queryRunner.query(`
      CREATE TABLE "bot_v2_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" character varying NOT NULL,
        "type" character varying NOT NULL,
        "reason" character varying,
        "payload" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bot_v2_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_bot_v2_events_user_id" ON "bot_v2_events" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "bot_v2_events"`);
    await queryRunner.query(`DROP TABLE "bot_v2_trades"`);
    await queryRunner.query(`DROP TABLE "bot_v2_state"`);
    await queryRunner.query(`DROP TABLE "bot_v2_settings"`);
  }
}
