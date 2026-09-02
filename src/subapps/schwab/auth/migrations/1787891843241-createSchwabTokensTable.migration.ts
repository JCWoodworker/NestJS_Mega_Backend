import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSchwabTokensTable1787891843241
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "schwab_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "access_token" text NOT NULL,
        "refresh_token" text NOT NULL,
        "access_token_expires_at" TIMESTAMPTZ NOT NULL,
        "refresh_token_expires_at" TIMESTAMPTZ NOT NULL,
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_schwab_tokens" PRIMARY KEY ("id")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "schwab_tokens"`);
  }
}
