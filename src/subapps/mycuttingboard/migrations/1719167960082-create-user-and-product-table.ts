import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserAndProductTable1719167960082
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "cbc_user_and_product" (
            "id" SERIAL NOT NULL PRIMARY KEY,
            "user_id" character varying NOT NULL,
            "product_id" character varying,
            "created_at" TIMESTAMP NOT NULL DEFAULT now(),
            "updated_at" TIMESTAMP NOT NULL DEFAULT now()
            )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    queryRunner.query(`DROP TABLE "cbc_wood"`);
  }
}
