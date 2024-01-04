import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFreeinvRooms1704335945284 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    queryRunner.query(
      `CREATE TABLE "rooms" (
        "id" SERIAL NOT NULL PRIMARY KEY,
        "name" character varying NOT NULL,
        "description" character varying,
        "parentId" character varying,
        "type" character varying NOT NULL DEFAULT 'location',
        "parentType" character varying NOT NULL DEFAULT 'room',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    queryRunner.query(`DROP TABLE "rooms"`);
  }
}
