import { MigrationInterface, QueryRunner } from 'typeorm';

export class Another1697250577694 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "user" ("username", "password") VALUES ('test', 'test')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "user" WHERE "username" = 'test'`);
  }
}
