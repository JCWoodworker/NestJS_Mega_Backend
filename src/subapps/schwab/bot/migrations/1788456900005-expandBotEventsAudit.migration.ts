import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Decision-audit expansion: new BotEvent types, optional JSON payload, and
 * (retention is enforced in BotEventService — 30 days by `at`, not row count).
 *
 * `transaction = false` so Postgres can `ALTER TYPE ... ADD VALUE` (not allowed
 * inside a transaction on many PG versions).
 */
export class ExpandBotEventsAudit1788456900005 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const values = [
      'GATE_SKIP',
      'NO_SIGNAL',
      'OPERATOR_SETTINGS',
      'OPERATOR_MODE',
      'OPERATOR_LANE',
      'OPERATOR_LIVE',
      'ERROR',
    ];
    for (const value of values) {
      await queryRunner.query(
        `ALTER TYPE "bot_events_type_enum" ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE "bot_events" ADD COLUMN IF NOT EXISTS "payload" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bot_events" DROP COLUMN IF EXISTS "payload"
    `);
    // Postgres cannot remove enum values safely — leave the type members.
  }
}
