import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Prefer frequent two-sided entries: ANY (OR) combine mode + calls/puts on by
 * default. Existing singleton settings row is updated so preprod/prod pick this
 * up without a manual desk save.
 *
 * `transaction = false` so Postgres can ADD VALUE and then USE 'ANY' in one
 * migration (enum values are not visible mid-transaction on many PG versions).
 */
export class BotCombineModeAnyAndTwoSided1788700000000
  implements MigrationInterface
{
  name = 'BotCombineModeAnyAndTwoSided1788700000000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "bot_settings_combine_mode_enum" ADD VALUE IF NOT EXISTS 'ANY'
    `);
    await queryRunner.query(`
      ALTER TABLE "bot_settings"
        ALTER COLUMN "combine_mode" SET DEFAULT 'ANY'
    `);
    await queryRunner.query(`
      ALTER TABLE "bot_settings"
        ALTER COLUMN "puts_enabled" SET DEFAULT true,
        ALTER COLUMN "can_buy_puts" SET DEFAULT true,
        ALTER COLUMN "cooldown_mins" SET DEFAULT 5,
        ALTER COLUMN "trade_window_start" SET DEFAULT '09:30'
    `);
    await queryRunner.query(`
      UPDATE "bot_settings"
      SET
        "combine_mode" = 'ANY',
        "puts_enabled" = true,
        "can_buy_puts" = true,
        "calls_enabled" = true,
        "can_buy_calls" = true,
        "cooldown_mins" = LEAST(COALESCE("cooldown_mins", 30), 5),
        "trade_window_start" = CASE
          WHEN "trade_window_start" > '09:30' THEN '09:30'
          ELSE "trade_window_start"
        END,
        "vwap_pullback_enabled" = true,
        "orb_5m_enabled" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "bot_settings" SET "combine_mode" = 'CONFIRMING'
      WHERE "combine_mode" = 'ANY'
    `);
    await queryRunner.query(`
      ALTER TABLE "bot_settings"
        ALTER COLUMN "combine_mode" SET DEFAULT 'CONFIRMING',
        ALTER COLUMN "puts_enabled" SET DEFAULT false,
        ALTER COLUMN "can_buy_puts" SET DEFAULT false,
        ALTER COLUMN "cooldown_mins" SET DEFAULT 30,
        ALTER COLUMN "trade_window_start" SET DEFAULT '10:00'
    `);
    // Postgres cannot remove an enum value safely; leave 'ANY' in the type.
  }
}
