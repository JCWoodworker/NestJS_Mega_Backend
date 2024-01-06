import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFreeinvItems1704335945706 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    queryRunner.query(
      `CREATE TABLE "items" (
        "id" SERIAL NOT NULL PRIMARY KEY,
        "name" character varying NOT NULL,
        "description" character varying,
        "roomId" integer, 
        "type" character varying NOT NULL DEFAULT 'location',
        "userId" character varying NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_Items_Room" FOREIGN KEY ("roomId") REFERENCES "rooms"("id")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    queryRunner.query(`DROP TABLE "items"`);
  }
}
