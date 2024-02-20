import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserSubappAccess1707955411994 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    queryRunner.query(
      `CREATE TABLE "user_subapp_access" (
        "id" SERIAL NOT NULL PRIMARY KEY,
        "userId" character varying NOT NULL,
        "subappId" character varying NOT NULL,
        "subscription_tier" character varying NOT NULL DEFAULT 'basic',
        "access_level" character varying NOT NULL DEFAULT 'basic',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // await queryRunner.query(
    //   `ALTER TABLE "userSubappAccess" DROP CONSTRAINT "FK_USER_SUBAPP_ACCESS_USER"`,
    // );
    queryRunner.query(`DROP TABLE "userSubappAccess"`);
  }
}

// CONSTRAINT "FK_USER_SUBAPP_ACCESS_USER"
// FOREIGN KEY ("userId") REFERENCES "users" ("id")
// ON UPDATE CASCADE
// ON DELETE CASCADE
