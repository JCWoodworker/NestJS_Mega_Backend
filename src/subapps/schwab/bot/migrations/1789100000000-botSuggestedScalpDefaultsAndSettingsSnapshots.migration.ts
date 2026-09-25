import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 2026-09-25 — fast-scalp Apply suggested defaults + durable settings history.
 *
 * 1. Align `bot_settings` column defaults with the new suggested COMFORTABLE
 *    profile (trail arm 20, min-lock 0, target 22, cooldown 2, ATR target 1.8).
 *    Does **not** UPDATE existing rows — James re-applies via Apply suggested
 *    so the change is explicit and snapshotted.
 *
 * 2. Create append-only `bot_settings_snapshots` for weekly rollup attribution.
 *    ADD-only; does not touch bot_trades / tape / analyzer corpus.
 */
export class BotSuggestedScalpDefaultsAndSettingsSnapshots1789100000000
  implements MigrationInterface
{
  name = 'BotSuggestedScalpDefaultsAndSettingsSnapshots1789100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bot_settings"
        ALTER COLUMN "trail_arm_pct" SET DEFAULT 20,
        ALTER COLUMN "trail_min_lock_pct" SET DEFAULT 0,
        ALTER COLUMN "premium_target_pct" SET DEFAULT 22,
        ALTER COLUMN "cooldown_mins" SET DEFAULT 2,
        ALTER COLUMN "target_atr_mult" SET DEFAULT 1.8;
    `);

    await queryRunner.query(`
      CREATE TYPE "bot_settings_snapshots_source_enum" AS ENUM (
        'suggested',
        'manual',
        'bootstrap'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "bot_settings_snapshots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" varchar NOT NULL,
        "at" bigint NOT NULL,
        "et_date_key" varchar(10) NOT NULL,
        "source" "bot_settings_snapshots_source_enum" NOT NULL,
        "settings" jsonb NOT NULL,
        "patch" jsonb,
        "equity" numeric(18,4),
        "tier" varchar(16),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bot_settings_snapshots" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_bot_settings_snapshots_user_at"
        ON "bot_settings_snapshots" ("user_id", "at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_bot_settings_snapshots_user_et"
        ON "bot_settings_snapshots" ("user_id", "et_date_key")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_bot_settings_snapshots_user_et"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_bot_settings_snapshots_user_at"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "bot_settings_snapshots"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "bot_settings_snapshots_source_enum"`,
    );

    await queryRunner.query(`
      ALTER TABLE "bot_settings"
        ALTER COLUMN "trail_arm_pct" SET DEFAULT 10,
        ALTER COLUMN "trail_min_lock_pct" SET DEFAULT 5,
        ALTER COLUMN "premium_target_pct" SET DEFAULT 40,
        ALTER COLUMN "cooldown_mins" SET DEFAULT 5,
        ALTER COLUMN "target_atr_mult" SET DEFAULT 2.5;
    `);
  }
}
