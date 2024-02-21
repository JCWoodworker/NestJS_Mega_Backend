import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBizLinksUserTable1708469134814 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    queryRunner.query(
      `CREATE TABLE "biz_links_user_table" (
      "id" SERIAL NOT NULL PRIMARY KEY,
      "userId" character varying NOT NULL,
      "username" character varying NOT NULL,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now()
    )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "biz_links_user_table"`);
  }
}
