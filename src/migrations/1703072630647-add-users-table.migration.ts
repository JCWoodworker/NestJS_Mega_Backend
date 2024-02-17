import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsersTable1703072630647 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    queryRunner.query(
      `CREATE TABLE "users" (
            "id" uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
            "password" character varying,
            "email" character varying NOT NULL UNIQUE,
            "role" character varying NOT NULL DEFAULT 'basic',
            "googleId" character varying,
            "created_at" TIMESTAMP NOT NULL DEFAULT now(),
            "updated_at" TIMESTAMP NOT NULL DEFAULT now())`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    queryRunner.query(`DROP TABLE "users"`);
  }
}
