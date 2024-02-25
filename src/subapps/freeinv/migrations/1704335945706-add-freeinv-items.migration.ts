import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFreeinvItems1704335945706 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    queryRunner.query(
      `CREATE TABLE "items" (
        "id" SERIAL NOT NULL PRIMARY KEY,
        "name" character varying NOT NULL,
        "description" character varying,
        "roomId" integer, 
        "type" character varying NOT NULL DEFAULT 'item',
        "userId" character varying NOT NULL,
        "image_url" character varying NOT NULL DEFAULT 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/No-Image-Placeholder.svg/832px-No-Image-Placeholder.svg.png',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_Items_Room"
          FOREIGN KEY ("roomId") 
          REFERENCES "rooms"("id")
          ON DELETE CASCADE
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "items" DROP CONSTRAINT "FK_Items_Room"`,
    );
    await queryRunner.query(`DROP TABLE "items"`);
  }
}
