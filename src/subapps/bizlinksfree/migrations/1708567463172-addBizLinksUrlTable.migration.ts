import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBizLinksUrlTable1708567463172 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "bizlinksfree_url" (
          "id" SERIAL NOT NULL PRIMARY KEY,
          "user_id" character varying NOT NULL,
          "url" character varying NOT NULL,
          "display_name" character varying NOT NULL,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now()
        )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "biz_links_user_table"`);
  }
}
