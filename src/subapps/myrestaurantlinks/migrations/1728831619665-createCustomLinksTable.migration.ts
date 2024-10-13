import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCustomLinksTable1728699473767 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "mrl_custom_links" (
            "id" SERIAL NOT NULL PRIMARY KEY,
            "restaurant_id" integer NOT NULL,
            "title" character varying NOT NULL,
            "url" character varying NOT NULL,
            "created_at" TIMESTAMP NOT NULL DEFAULT now(),
            "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "FK_mrl_custom_links_restaurant" FOREIGN KEY ("restaurant_id") 
            REFERENCES "mrl_restaurants" ("id") ON DELETE CASCADE
        )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "mrl_custom_links"`);
  }
}
