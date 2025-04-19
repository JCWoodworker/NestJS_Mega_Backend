import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWallImagesTable1745074080828 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "wall_images" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "wall_id" uuid NOT NULL,
        "image_url" character varying(2048) NOT NULL,
        "description" text,
        "stage" character varying(100),
        "taken_at" TIMESTAMP WITH TIME ZONE,
        "uploaded_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wall_images_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_wall_images_wall_id" FOREIGN KEY ("wall_id") REFERENCES "walls"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_wall_images_wall_id" ON "wall_images" ("wall_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_wall_images_wall_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wall_images"`);
  }
}
