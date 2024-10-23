import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSocialLinksTable1728839370660 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "mrl_social_links" (
                "id" SERIAL NOT NULL PRIMARY KEY,
                "restaurant_id" integer NOT NULL REFERENCES "mrl_restaurants" ("id") ON DELETE CASCADE,
                "social_media_platform" character varying NOT NULL,
                "url" character varying NOT NULL,
                "is_active" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now()
            )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "mrl_custom_links"`);
  }
}