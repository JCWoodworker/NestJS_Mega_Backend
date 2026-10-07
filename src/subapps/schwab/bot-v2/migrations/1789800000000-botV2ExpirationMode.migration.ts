import { MigrationInterface, QueryRunner } from 'typeorm';

export class BotV2ExpirationMode1789800000000 implements MigrationInterface {
  name = 'BotV2ExpirationMode1789800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bot_v2_settings" ADD "expiration_mode" character varying NOT NULL DEFAULT '0DTE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bot_v2_settings" DROP COLUMN "expiration_mode"`,
    );
  }
}
