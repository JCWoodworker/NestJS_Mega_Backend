import { MigrationInterface, QueryRunner } from 'typeorm';

/** Saturday search ledger. Does not touch trades or settings. */
export class BotSearchLedger1790200000000 implements MigrationInterface {
  name = 'BotSearchLedger1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "bot_search_ledger" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" varchar NOT NULL,
        "week_ending_et" varchar(10) NOT NULL,
        "body" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bot_search_ledger" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_bot_search_ledger_user_week"
      ON "bot_search_ledger" ("user_id", "week_ending_et")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "bot_search_ledger"`);
  }
}
