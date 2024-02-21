import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFreeinvLocations1704335944858 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    queryRunner.query(
      `CREATE TABLE "locations" (
        "id" SERIAL NOT NULL PRIMARY KEY,
        "name" character varying NOT NULL,
        "description" character varying,
        "type" character varying NOT NULL DEFAULT 'location',
        "userId" character varying NOT NULL,
        "image_url" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "locations"`);
  }
}
