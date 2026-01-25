import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReferralsTable1737849600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "mywoodapp_referrals" (
        "id" SERIAL NOT NULL PRIMARY KEY,
        "source" character varying(100) NOT NULL,
        "timestamp" TIMESTAMP NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "ip_address" character varying(45),
        "user_agent" TEXT
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_mywoodapp_referrals_source" ON "mywoodapp_referrals" ("source")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_mywoodapp_referrals_source"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "mywoodapp_referrals"`);
  }
}
