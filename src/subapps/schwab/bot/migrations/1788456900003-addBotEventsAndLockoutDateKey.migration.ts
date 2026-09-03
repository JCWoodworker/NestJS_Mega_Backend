import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBotEventsAndLockoutDateKey1788456900003
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bot_state" ADD COLUMN "lockout_date_key" varchar(10)
    `);

    await queryRunner.query(`
      CREATE TYPE "bot_events_type_enum" AS ENUM (
        'SIGNAL', 'SKIP', 'ENTRY_SUBMIT', 'ENTRY_FILL', 'EXIT_SUBMIT',
        'EXIT_FILL', 'FLAT_KILL', 'LOCKOUT', 'UNLOCK', 'PHASE'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "bot_events_direction_enum" AS ENUM ('CALL', 'PUT')
    `);

    await queryRunner.query(`
      CREATE TABLE "bot_events" (
        "id" SERIAL NOT NULL,
        "at" bigint NOT NULL,
        "lane" "bot_state_lane_enum",
        "type" "bot_events_type_enum" NOT NULL,
        "direction" "bot_events_direction_enum",
        "side" varchar(4),
        "symbol" varchar(32),
        "quantity" integer,
        "fill_price" decimal(12,4),
        "underlying_price" decimal(12,4),
        "strategies" jsonb,
        "reason" text,
        "order_id" varchar(64),
        CONSTRAINT "PK_bot_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_bot_events_id_desc" ON "bot_events" ("id" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "bot_events"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bot_events_direction_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bot_events_type_enum"`);
    await queryRunner.query(
      `ALTER TABLE "bot_state" DROP COLUMN IF EXISTS "lockout_date_key"`,
    );
  }
}
