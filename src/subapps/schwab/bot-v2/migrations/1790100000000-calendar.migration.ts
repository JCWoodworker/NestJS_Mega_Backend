import { MigrationInterface, QueryRunner } from 'typeorm';

export class Calendar1790100000000 implements MigrationInterface {
  name = 'Calendar1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "calendar_capital_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" character varying NOT NULL,
        "book" character varying NOT NULL,
        "kind" character varying NOT NULL,
        "et_date_key" character varying(10) NOT NULL,
        "at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "balance_before" numeric(18,4),
        "balance_after" numeric(18,4) NOT NULL,
        "amount" numeric(18,4) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_calendar_capital_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_calendar_capital_user_book_at" ON "calendar_capital_events" ("user_id", "book", "at")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_calendar_capital_one_baseline" ON "calendar_capital_events" ("user_id", "book") WHERE "kind" = 'BASELINE'`,
    );
    await queryRunner.query(`
      CREATE TABLE "calendar_notes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" character varying NOT NULL,
        "grain" character varying NOT NULL,
        "period_key" character varying NOT NULL,
        "body" text NOT NULL,
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_calendar_notes" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_calendar_notes_user_period" ON "calendar_notes" ("user_id", "grain", "period_key")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "calendar_notes"`);
    await queryRunner.query(`DROP TABLE "calendar_capital_events"`);
  }
}
