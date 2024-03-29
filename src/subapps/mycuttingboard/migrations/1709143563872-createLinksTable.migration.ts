import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMycuttingboardLinksTable1709143563872
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "mycuttingboard_links" (
        "id" SERIAL NOT NULL PRIMARY KEY,
        "link_url" character varying NOT NULL,
        "link_display_name" character varying NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "links"`);
  }
}
