import { MigrationInterface, QueryRunner } from 'typeorm';

export class BotV2TradeStrategies1789600000000 implements MigrationInterface {
  name = 'BotV2TradeStrategies1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bot_v2_trades" ADD "strategies" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bot_v2_trades" DROP COLUMN "strategies"`,
    );
  }
}
