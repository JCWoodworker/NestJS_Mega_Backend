import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Decision-audit expansion: new BotEvent types + optional JSON payload.
 * Retention is enforced in BotEventService (30 days by `at`).
 *
 * PG 12+ allows ALTER TYPE … ADD VALUE inside a transaction (Heroku PG 14+).
 * Do not set `transaction = false` — this app's TypeORM global mode is "all"
 * and forbids per-migration overrides (ForbiddenTransactionModeOverrideError).
 */
export class ExpandBotEventsAudit1788456900005 implements MigrationInterface {
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
  }
}
