import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductsAndWoodsTable1718910694438
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "cbc_product_and_woods" (
            "id" SERIAL NOT NULL PRIMARY KEY,
            "product_id" character varying NOT NULL,
            "wood_id" character varying NOT NULL,
            "created_at" TIMESTAMP NOT NULL DEFAULT now(),
            "updated_at" TIMESTAMP NOT NULL DEFAULT now()
          )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "cbc_product_and_woods"`);
  }
}
