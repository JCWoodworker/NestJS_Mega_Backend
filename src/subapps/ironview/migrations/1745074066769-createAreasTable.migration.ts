import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAreasTable1745074066769 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "areas" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "floor_id" uuid NOT NULL,
        "area_type_id" integer NOT NULL,
        "unit_number" character varying(100) NOT NULL,
        "name" character varying(255),
        "sq_footage" integer,
        "notes" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_areas_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_areas_floor_id" FOREIGN KEY ("floor_id") REFERENCES "floors"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_areas_area_type_id" FOREIGN KEY ("area_type_id") REFERENCES "area_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "areas"`);
  }
}
