import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Event types for the unattended session supervisor.
 *
 * Its decisions — armed, refused and why, stood down — are recorded rather
 * than only logged, because a background process that silently does nothing
 * is indistinguishable from one that is broken. The admin panel reads these
 * to explain a refusal and offer a reconcile.
 *
 * PG 12+ allows ALTER TYPE … ADD VALUE inside a transaction (Heroku PG 14+).
 * Do not set `transaction = false` — this app's TypeORM global mode is "all"
 * and forbids per-migration overrides (ForbiddenTransactionModeOverrideError).
 */
export class AddSupervisorEventTypes1788900400000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const values = [
      'SUPERVISOR_ARM',
      'SUPERVISOR_REFUSED',
      'SUPERVISOR_STANDDOWN',
    ];
    for (const value of values) {
      await queryRunner.query(
        `ALTER TYPE "bot_events_type_enum" ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }
  }

  public async down(): Promise<void> {
    // Postgres cannot remove a value from an enum type. Leaving them in place
    // is harmless — nothing writes them once the supervisor is gone.
  }
}
