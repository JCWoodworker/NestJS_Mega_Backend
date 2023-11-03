import { MigrationInterface, QueryRunner } from 'typeorm';

export class Users1697386288899 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    queryRunner.query(
      `CREATE TABLE "users" (
        "userId" SERIAL NOT NULL PRIMARY KEY,
        "username" character varying NOT NULL UNIQUE,
        "password" character varying NOT NULL,
        "email" character varying NOT NULL UNIQUE,
        "userType" character varying NOT NULL DEFAULT 'user',
        "refreshToken" character varying DEFAULT NULL,
        "passwordResetToken" character varying DEFAULT NULL,
        "passwordResetJwt" character varying DEFAULT NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    queryRunner.query(`DROP TABLE "users"`);
  }
}
