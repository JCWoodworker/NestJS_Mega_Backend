import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLinksTable1720838363157 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "cbc_links" (
            "id" SERIAL NOT NULL PRIMARY KEY,
            "user_id" character varying NOT NULL,
            "link_id" character varying NOT NULL,
            "created_at" TIMESTAMP NOT NULL DEFAULT now(),
            "updated_at" TIMESTAMP NOT NULL DEFAULT now()
            )`,
    );
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "cbc_links"`);
  }
}
