import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBizLinksUserTable1708469134814 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    queryRunner.query(
      `CREATE TABLE "bizlinksfree_user_settings" (
      "id" SERIAL NOT NULL PRIMARY KEY,
      "user_id" character varying NOT NULL,
      "display_name" character varying NOT NULL,
      "business_name" character varying,
      "color_scheme" character varying NOT NULL DEFAULT 'default',
      "logo_url" character varying NOT NULL DEFAULT 'default',
      "facebook_url" character varying,
      "twitter_url" character varying,
      "instagram_url" character varying,
      "linkedin_url" character varying,
      "youtube_url" character varying,
      "github_url" character varying,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now()
    )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "biz_links_user_table"`);
  }
}
