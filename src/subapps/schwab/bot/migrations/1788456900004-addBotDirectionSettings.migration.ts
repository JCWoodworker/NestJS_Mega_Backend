import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds CALL/PUT direction preference + operator-declared account capability
 * flags to `bot_settings`. Defaults match today's reality: calls-only
 * preference + calls-only declared capability.
 */
export class AddBotDirectionSettings1788456900004
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bot_settings"
        ADD COLUMN "calls_enabled" boolean NOT NULL DEFAULT true,
        ADD COLUMN "puts_enabled" boolean NOT NULL DEFAULT false,
        ADD COLUMN "can_buy_calls" boolean NOT NULL DEFAULT true,
        ADD COLUMN "can_buy_puts" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bot_settings"
        DROP COLUMN IF EXISTS "can_buy_puts",
        DROP COLUMN IF EXISTS "can_buy_calls",
        DROP COLUMN IF EXISTS "puts_enabled",
        DROP COLUMN IF EXISTS "calls_enabled"
    `);
  }
}
