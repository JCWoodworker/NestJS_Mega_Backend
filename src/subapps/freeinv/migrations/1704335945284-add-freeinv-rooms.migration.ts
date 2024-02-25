import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFreeinvRooms1704335945284 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    queryRunner.query(
      `CREATE TABLE "rooms" (
        "id" SERIAL NOT NULL PRIMARY KEY,
        "name" character varying NOT NULL,
        "description" character varying,
        "type" character varying NOT NULL DEFAULT 'room',
        "locationId" integer,
        "userId" character varying NOT NULL,
        "image_url" character varying NOT NULL DEFAULT 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/No-Image-Placeholder.svg/832px-No-Image-Placeholder.svg.png',
        "orphan_room" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_ROOMS_LOCATION" 
          FOREIGN KEY ("locationId") 
          REFERENCES "locations" ("id")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "rooms" DROP CONSTRAINT "FK_ROOMS_LOCATION"`,
    );
    await queryRunner.query(`DROP TABLE "rooms"`);
  }
}
