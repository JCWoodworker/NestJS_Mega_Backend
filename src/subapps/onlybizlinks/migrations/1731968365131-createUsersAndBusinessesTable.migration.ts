import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersAndBusinessesTable1731968365131
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "obl_users_and_businesses" (
                    "id" SERIAL NOT NULL PRIMARY KEY,
                    "business_id" integer NOT NULL REFERENCES "obl_businesses" ("id") ON DELETE CASCADE,
                    "user_id" character varying NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
                    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                    "updated_at" TIMESTAMP NOT NULL DEFAULT now()
                )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "obl_users_and_businesses"`);
  }
}
