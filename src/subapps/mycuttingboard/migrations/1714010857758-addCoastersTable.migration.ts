import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCoastersTable1714010857758 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "mycuttingboard_coasters" (
        "id" SERIAL NOT NULL PRIMARY KEY,
        "user_id" character varying NOT NULL,
        "coaster_type" character varying NOT NULL,
        "coaster_description" character varying,
        "customer_message" character varying,
        "coaster_image_url" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
        )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "mycuttingboard_coasters"`);
  }
}
