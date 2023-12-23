import { MigrationInterface, QueryRunner } from 'typeorm';

export class Users1703072630647 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    queryRunner.query(
      `CREATE TABLE "users" (
            "userId" SERIAL NOT NULL PRIMARY KEY,
            "password" character varying NOT NULL,
            "email" character varying NOT NULL UNIQUE)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    queryRunner.query(`DROP TABLE "users"`);
  }
}
