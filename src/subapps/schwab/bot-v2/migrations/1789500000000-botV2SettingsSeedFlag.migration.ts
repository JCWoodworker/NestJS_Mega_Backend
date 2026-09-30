import { MigrationInterface, QueryRunner } from 'typeorm';

export class BotV2SettingsSeedFlag1789500000000 implements MigrationInterface {
  name = 'BotV2SettingsSeedFlag1789500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bot_v2_settings" ADD "seeded_from_champion" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bot_v2_settings" DROP COLUMN "seeded_from_champion"`,
    );
  }
}
