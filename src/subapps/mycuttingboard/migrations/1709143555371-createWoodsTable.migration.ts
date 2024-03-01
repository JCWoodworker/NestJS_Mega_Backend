import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWoodsTable1709143555371 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "woods" (
        "id" SERIAL NOT NULL PRIMARY KEY,
        "wood_name" character varying NOT NULL,
        "wood_description" character varying,
        "wood_region" character varying,
        "wood_hardness" character varying,
        "wood_image_url" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "woods"`);
  }
}
