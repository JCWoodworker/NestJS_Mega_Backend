import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Caps the admin set at exactly one row, in the database rather than in
 * application code.
 *
 * Application-level checks can be refactored away; this constraint cannot.
 * Safe to add because no endpoint mutates `users.role` — the only writer is
 * `AdminBootstrapService`, which demotes any other admin before promoting,
 * specifically so this index never rejects the intended grant.
 *
 * Partial index rather than a table constraint so the many `basic` rows are
 * unaffected.
 */
export class EnforceSingleAdmin1788900100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Collapse any pre-existing multi-admin state first, otherwise creating
    // the index fails and blocks the deploy. Keep the oldest account, which
    // is the original operator; ADMIN_BOOTSTRAP_EMAIL reconciles to the
    // configured intent on the next boot either way.
    await queryRunner.query(
      `UPDATE "users" SET "role" = 'basic'
       WHERE "role" = 'admin'
         AND "id" <> (
           SELECT "id" FROM "users"
           WHERE "role" = 'admin'
           ORDER BY "created_at" ASC
           LIMIT 1
         )`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_one_admin_only"
         ON "users" (("role"))
         WHERE "role" = 'admin'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_one_admin_only"`);
  }
}
