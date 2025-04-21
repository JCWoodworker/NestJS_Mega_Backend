import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWallsTable1745074075951 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "walls" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "room_id" uuid NOT NULL,
          "identifier" character varying(255) NOT NULL,
          "approx_length_ft" numeric(5, 2),
          "approx_height_ft" numeric(5, 2),
          "notes" text,
          "nfc_tag_id" character varying(255),
          "qr_code_id" character varying(255),
          "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "PK_walls_id" PRIMARY KEY ("id"),
          CONSTRAINT "FK_walls_room_id" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
          CONSTRAINT "UQ_walls_nfc_tag_id" UNIQUE ("nfc_tag_id"),
          CONSTRAINT "UQ_walls_qr_code_id" UNIQUE ("qr_code_id")
        )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_walls_nfc_tag_id" ON "walls" ("nfc_tag_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_walls_qr_code_id" ON "walls" ("qr_code_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_walls_qr_code_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_walls_nfc_tag_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "walls"`);
  }
}
