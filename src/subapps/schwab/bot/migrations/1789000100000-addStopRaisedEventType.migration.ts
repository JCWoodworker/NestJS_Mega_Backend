import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `STOP_RAISED` — the trail moved an open position's premium stop up.
 *
 * PG 12+ allows ALTER TYPE … ADD VALUE inside a transaction (Heroku PG 14+).
 * Do not set `transaction = false` — this app's TypeORM global mode is "all"
 * and forbids per-migration overrides (ForbiddenTransactionModeOverrideError).
 */
export class AddStopRaisedEventType1789000100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "bot_events_type_enum" ADD VALUE IF NOT EXISTS 'STOP_RAISED'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres cannot remove a value from an enum type. Harmless to leave:
    // nothing writes it once the trail is disabled.
  }
}
