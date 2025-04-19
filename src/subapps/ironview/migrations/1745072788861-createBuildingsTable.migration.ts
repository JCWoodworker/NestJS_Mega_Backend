import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBuildingsTable1745072788861 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "buildings" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "name" character varying(255) NOT NULL,
          "address" character varying(255),
          "city" character varying(100),
          "state" character varying(50),
          "zip_code" character varying(20),
          "construction_date" date,
          "notes" text,
          "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "PK_buildings_id" PRIMARY KEY ("id")
        )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "buildings"`);
  }
}
