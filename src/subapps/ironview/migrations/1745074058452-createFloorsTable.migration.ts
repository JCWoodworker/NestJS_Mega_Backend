import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFloorsTable1745074058452 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "floors" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "building_id" uuid NOT NULL,
        "floor_number" character varying(50) NOT NULL,
        "name" character varying(255),
        "blueprint_url" character varying(2048),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_floors_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_floors_building_id" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "floors" DROP CONSTRAINT "FK_floors_building_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "floors"`);
  }
}
