import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWoodPricingMaterialsTable1784225229571
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "woodpricing_materials_measurement_type_enum" AS ENUM ('BOARD_FOOT', 'LINEAR_FOOT')`,
    );

    await queryRunner.query(
      `CREATE TABLE "woodpricing_materials" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "species" character varying(150) NOT NULL,
        "measurement_type" "woodpricing_materials_measurement_type_enum" NOT NULL,
        "thickness" character varying(10),
        "unit_price" numeric(10,2) NOT NULL,
        "dimensions" jsonb,
        "last_updated" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_woodpricing_materials" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_woodpricing_materials_species_type_thickness" ON "woodpricing_materials" ("species", "measurement_type", "thickness")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_woodpricing_materials_species_type_thickness"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "woodpricing_materials"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "woodpricing_materials_measurement_type_enum"`,
    );
  }
}
