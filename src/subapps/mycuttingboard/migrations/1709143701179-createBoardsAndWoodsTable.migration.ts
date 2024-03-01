import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBoardsAndWoodsTable1709143701179
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "boards_and_woods" (
        "id" SERIAL NOT NULL PRIMARY KEY,
        "board_id" character varying NOT NULL,
        "wood_id" character varying NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "boards_and_woods"`);
  }
}
