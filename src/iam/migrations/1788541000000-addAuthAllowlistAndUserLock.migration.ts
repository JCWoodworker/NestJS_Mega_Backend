import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthAllowlistAndUserLock1788541000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "auth_allowed_emails" (
        "id" SERIAL NOT NULL PRIMARY KEY,
        "email" character varying NOT NULL UNIQUE,
        "created_by" character varying,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "note" character varying
      );
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "is_locked" boolean NOT NULL DEFAULT false;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "is_locked";
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "auth_allowed_emails";`);
  }
}
