import { MigrationInterface, QueryRunner } from 'typeorm';

export class BotV2TimeStop1789700000000 implements MigrationInterface {
  name = 'BotV2TimeStop1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bot_v2_settings" ADD "use_time_stop" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "bot_v2_settings" ADD "time_stop_seconds" integer NOT NULL DEFAULT 180`,
    );
    await queryRunner.query(
      `ALTER TABLE "bot_v2_settings" ADD "rapid_profile_applied_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bot_v2_settings" DROP COLUMN "rapid_profile_applied_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bot_v2_settings" DROP COLUMN "time_stop_seconds"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bot_v2_settings" DROP COLUMN "use_time_stop"`,
    );
  }
}
