import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAreaTypesTable1745074061588 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "area_types" (
        "id" SERIAL NOT NULL,
        "type_name" character varying(100) NOT NULL,
        "description" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_area_types_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_area_types_type_name" UNIQUE ("type_name")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "area_types"`);
  }
}
