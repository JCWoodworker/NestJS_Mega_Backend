import { MigrationInterface, QueryRunner } from 'typeorm';

/** Premium soft-stop / target + ATR-scaled underlying exit multipliers. */
export class AddBotPremiumSoftStopSettings1788542000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bot_settings"
        ADD COLUMN IF NOT EXISTS "use_premium_stop" boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "premium_stop_pct" numeric(8,4) NOT NULL DEFAULT 25,
        ADD COLUMN IF NOT EXISTS "use_premium_target" boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "premium_target_pct" numeric(8,4) NOT NULL DEFAULT 40,
        ADD COLUMN IF NOT EXISTS "stop_atr_mult" numeric(8,4) NOT NULL DEFAULT 1.5,
        ADD COLUMN IF NOT EXISTS "target_atr_mult" numeric(8,4) NOT NULL DEFAULT 2.5;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bot_settings"
        DROP COLUMN IF EXISTS "use_premium_stop",
        DROP COLUMN IF EXISTS "premium_stop_pct",
        DROP COLUMN IF EXISTS "use_premium_target",
        DROP COLUMN IF EXISTS "premium_target_pct",
        DROP COLUMN IF EXISTS "stop_atr_mult",
        DROP COLUMN IF EXISTS "target_atr_mult";
    `);
  }
}
