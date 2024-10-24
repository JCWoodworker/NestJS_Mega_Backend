import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBusinessessTable1728699473766 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "obl_businesses" (
            "id" SERIAL NOT NULL PRIMARY KEY,
            "name" character varying NOT NULL,
            "logo" character varying,
            "domain" character varying,
            "created_at" TIMESTAMP NOT NULL DEFAULT now(),
            "updated_at" TIMESTAMP NOT NULL DEFAULT now()
        )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "obl_businesses"`);
  }
}
