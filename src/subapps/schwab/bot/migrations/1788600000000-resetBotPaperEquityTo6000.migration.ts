import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Paper ledger defaults to $6,000 (just above the unified $5,000 bot floor)
 * and existing singleton row(s) are reset so paper mimics a thin live account.
 */
export class ResetBotPaperEquityTo60001788600000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bot_state"
        ALTER COLUMN "paper_equity" SET DEFAULT 6000,
        ALTER COLUMN "paper_settled_cash" SET DEFAULT 6000,
        ALTER COLUMN "paper_day_start_equity" SET DEFAULT 6000;
    `);
    await queryRunner.query(`
      UPDATE "bot_state"
      SET
        "paper_equity" = 6000,
        "paper_settled_cash" = 6000,
        "paper_day_start_equity" = 6000
      WHERE "open_position" IS NULL
         OR ("open_position"->>'source') IS DISTINCT FROM 'BOT_PAPER';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bot_state"
        ALTER COLUMN "paper_equity" SET DEFAULT 1000,
        ALTER COLUMN "paper_settled_cash" SET DEFAULT 1000,
        ALTER COLUMN "paper_day_start_equity" SET DEFAULT 1000;
    `);
  }
}
