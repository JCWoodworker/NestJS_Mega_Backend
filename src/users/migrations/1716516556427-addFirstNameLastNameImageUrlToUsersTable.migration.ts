import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFirstNameLastNameImageUrlToUsersTable1716516556427
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "users" 
            ADD COLUMN "first_name" character varying,
            ADD COLUMN "last_name" character varying,
            ADD COLUMN "image_url" character varying;
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "users" 
            DROP COLUMN "first_name",
            DROP COLUMN "last_name",
            DROP COLUMN "image_url";
        `);
  }
}
