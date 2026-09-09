import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStatusDescriptionToOrderHistory1788550000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "schwab_order_history"
        ADD COLUMN "status_description" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "schwab_order_history"
        DROP COLUMN IF EXISTS "status_description"
    `);
  }
}
