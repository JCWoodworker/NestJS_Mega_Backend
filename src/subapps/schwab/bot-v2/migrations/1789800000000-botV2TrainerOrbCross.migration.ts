import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * House trainer defaults: one-shot ORB crossover (not every bar outside the
 * range) and a 15% premium target that clears fees before theta erodes gains.
 */
export class BotV2TrainerOrbCross1789800000000 implements MigrationInterface {
  name = 'BotV2TrainerOrbCross1789800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bot_v2_settings" ALTER COLUMN "strategies_enabled" SET DEFAULT '["VWAP_PULLBACK","ORB_5M_CROSS"]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "bot_v2_settings" ALTER COLUMN "premium_target_pct" SET DEFAULT 15`,
    );
    await queryRunner.query(`
      UPDATE "bot_v2_settings"
      SET
        "strategies_enabled" = '["VWAP_PULLBACK","ORB_5M_CROSS"]'::jsonb,
        "premium_target_pct" = CASE
          WHEN "premium_target_pct" = 22 THEN 15
          ELSE "premium_target_pct"
        END
      WHERE
        "bot_underlying" = 'SPY'
        AND "signal_bar_seconds" = 60
        AND "rapid_profile_applied_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bot_v2_settings" ALTER COLUMN "strategies_enabled" SET DEFAULT '["VWAP_PULLBACK","ORB_5M"]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "bot_v2_settings" ALTER COLUMN "premium_target_pct" SET DEFAULT 22`,
    );
  }
}
