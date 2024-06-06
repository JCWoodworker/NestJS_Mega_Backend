import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductsTable1717707898300 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "cbc_product" (
        "id" SERIAL NOT NULL PRIMARY KEY,
        "user_id" character varying NOT NULL,
        "type" character varying NOT NULL,
        "title" character varying NOT NULL,
        "description" character varying,
        "customer_message" character varying,
        "image_url" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "cbc_product"`);
  }
}
