import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One jsonb list replaces the per-strategy booleans, and an integer replaces
 * the ANY/CONFIRMING split so a new strategy does not need its own column.
 */
export class StrategiesEnabled1789300200000 implements MigrationInterface {
  name = 'StrategiesEnabled1789300200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bot_settings" ADD COLUMN "strategies_enabled" jsonb`,
    );
    await queryRunner.query(`
      UPDATE "bot_settings"
      SET "strategies_enabled" = (
        SELECT COALESCE(jsonb_agg(strategy), '[]'::jsonb)
        FROM (
          SELECT 'VWAP_PULLBACK' AS strategy WHERE "vwap_pullback_enabled"
          UNION ALL
          SELECT 'ORB_5M' WHERE "orb_5m_enabled"
        ) enabled
      )
    `);
    await queryRunner.query(`
      UPDATE "bot_settings"
      SET "strategies_enabled" = '["VWAP_PULLBACK","ORB_5M"]'::jsonb
      WHERE "strategies_enabled" IS NULL
         OR "strategies_enabled" = '[]'::jsonb
    `);
    await queryRunner.query(
      `ALTER TABLE "bot_settings" ALTER COLUMN "strategies_enabled" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "bot_settings" ALTER COLUMN "strategies_enabled" SET DEFAULT '["VWAP_PULLBACK","ORB_5M"]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "bot_settings" ADD COLUMN "min_strategy_agreement" integer NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(`
      UPDATE "bot_settings"
      SET "min_strategy_agreement" = GREATEST(jsonb_array_length("strategies_enabled"), 1)
      WHERE "combine_mode" = 'CONFIRMING'
    `);
    await queryRunner.query(
      `ALTER TABLE "bot_settings" DROP COLUMN "vwap_pullback_enabled"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bot_settings" DROP COLUMN "orb_5m_enabled"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bot_settings" ADD COLUMN "vwap_pullback_enabled" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "bot_settings" ADD COLUMN "orb_5m_enabled" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(`
      UPDATE "bot_settings"
      SET "vwap_pullback_enabled" = "strategies_enabled" ? 'VWAP_PULLBACK',
          "orb_5m_enabled" = "strategies_enabled" ? 'ORB_5M'
    `);
    await queryRunner.query(
      `ALTER TABLE "bot_settings" DROP COLUMN "min_strategy_agreement"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bot_settings" DROP COLUMN "strategies_enabled"`,
    );
  }
}
