import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Peak-trailing premium stop, armed by a gain threshold.
 *
 * `use_trail_stop` defaults false so the deploy cannot change exit behaviour
 * on an account that has not opted in — the fill-time stop/target plan stays
 * in force until an operator flips it.
 *
 * `trail_min_lock_pct` (default 5) is the guaranteed profit banked at arm —
 * the stop floor becomes max(peak trail, breakeven, entry × 1.05) rather than
 * just breakeven, so arming always locks in something.
 */
export class AddBotTrailStopSettings1789000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bot_settings"
        ADD COLUMN IF NOT EXISTS "use_trail_stop" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "trail_arm_pct" numeric(8,4) NOT NULL DEFAULT 20,
        ADD COLUMN IF NOT EXISTS "trail_pct" numeric(8,4) NOT NULL DEFAULT 15,
        ADD COLUMN IF NOT EXISTS "trail_min_lock_pct" numeric(8,4) NOT NULL DEFAULT 5;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bot_settings"
        DROP COLUMN IF EXISTS "use_trail_stop",
        DROP COLUMN IF EXISTS "trail_arm_pct",
        DROP COLUMN IF EXISTS "trail_pct",
        DROP COLUMN IF EXISTS "trail_min_lock_pct";
    `);
  }
}
