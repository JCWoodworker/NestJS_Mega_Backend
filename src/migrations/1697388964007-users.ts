import { MigrationInterface, QueryRunner } from 'typeorm';

export class Users1697386288899 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    queryRunner.query(
      `CREATE TABLE "users" (
        "userId" SERIAL NOT NULL PRIMARY KEY,
        "username" character varying NOT NULL UNIQUE,
        "password" character varying NOT NULL,
        "userType" character varying NOT NULL DEFAULT 'user')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    queryRunner.query(`DROP TABLE "users"`);
  }
}
