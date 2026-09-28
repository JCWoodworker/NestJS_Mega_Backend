import { MigrationInterface, QueryRunner } from 'typeorm';

/** Saturday propose packets. Does not touch bot_trades or bot_settings. */
export class BotProposals1789200000000 implements MigrationInterface {
  name = 'BotProposals1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "bot_proposals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" varchar NOT NULL,
        "week_ending_et" varchar(10) NOT NULL,
        "actionable" boolean NOT NULL DEFAULT false,
        "packet" jsonb NOT NULL,
        "status" varchar(32) NOT NULL DEFAULT 'draft',
        "applied_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bot_proposals" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "bot_proposals"`);
  }
}
