import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Analyzer output, one row per user per ET session.
 *
 * The composite primary key on (user_id, et_date_key) makes a re-run
 * overwrite the day rather than appending a second, divergent verdict for it
 * — the analyzer is idempotent by design so a retried nightly job cannot
 * produce two different answers for the same session.
 */
export class CreateBotDailyReports1788900500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "bot_daily_reports" (
        "user_id" character varying NOT NULL,
        "et_date_key" character varying(10) NOT NULL,
        "trades" integer NOT NULL DEFAULT 0,
        "cumulative_trades" integer NOT NULL DEFAULT 0,
        "readiness_level" character varying(16) NOT NULL,
        "gross_pnl" numeric(18,4) NOT NULL DEFAULT 0,
        "fees" numeric(18,4) NOT NULL DEFAULT 0,
        "net_pnl" numeric(18,4) NOT NULL DEFAULT 0,
        "aggregate" jsonb NOT NULL,
        "policy_results" jsonb,
        "markdown" text NOT NULL,
        "generated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bot_daily_reports" PRIMARY KEY ("user_id", "et_date_key")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bot_daily_reports_user_date"
         ON "bot_daily_reports" ("user_id", "et_date_key")`,
    );

    await queryRunner.query(
      `ALTER TABLE "bot_daily_reports"
         ADD CONSTRAINT "FK_bot_daily_reports_user_id"
         FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bot_daily_reports" DROP CONSTRAINT IF EXISTS "FK_bot_daily_reports_user_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "bot_daily_reports"`);
  }
}
