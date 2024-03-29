import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMycuttingboardBoardsTable1709143539316
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "mycuttingboard_boards" (
        "id" SERIAL NOT NULL PRIMARY KEY,
        "user_id" character varying NOT NULL,
        "board_type" character varying NOT NULL,
        "board_description" character varying,
        "customer_message" character varying,
        "board_image_url" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "boards"`);
  }
}
