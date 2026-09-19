import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cache column only — self-healing. `SchwabAccountResolver.resolve()` writes
 * it the next time each connected user's account resolves, so no backfill
 * is needed here; a currently-active connection populates it on its own
 * within one resolve cycle.
 */
export class AddAccountHashToSchwabTokens1788960000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "schwab_tokens" ADD COLUMN IF NOT EXISTS "account_hash" character varying(64)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "schwab_tokens" DROP COLUMN IF EXISTS "account_hash"`,
    );
  }
}
