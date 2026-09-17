import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes Schwab OAuth per-user instead of one shared personal account.
 *
 * The existing row (if any) is the owner's live connection, so it is
 * backfilled to `SCHWAB_OWNER_USER_ID` rather than dropped — otherwise
 * deploying this would disconnect the running desk and require a manual
 * reconnect through the Schwab consent screen.
 *
 * If that env var is unset or names a user that does not exist, the orphan
 * rows are deleted instead of being left with a NULL owner that no request
 * could ever match. Reconnecting via /auth/connect is a few seconds of work;
 * a row nobody owns is a permanent source of confusion.
 */
export class AddUserIdToSchwabTokens1788900000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "schwab_tokens" ADD COLUMN "user_id" character varying`,
    );

    const ownerUserId = process.env.SCHWAB_OWNER_USER_ID?.trim();
    if (ownerUserId) {
      const [owner] = await queryRunner.query(
        `SELECT "id" FROM "users" WHERE "id" = $1`,
        [ownerUserId],
      );
      if (owner) {
        await queryRunner.query(
          `UPDATE "schwab_tokens" SET "user_id" = $1 WHERE "user_id" IS NULL`,
          [ownerUserId],
        );
      }
    }

    await queryRunner.query(
      `DELETE FROM "schwab_tokens" WHERE "user_id" IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "schwab_tokens" ALTER COLUMN "user_id" SET NOT NULL`,
    );

    // Collapse any pre-existing duplicates before the unique index, keeping
    // the freshest row per user — matching what getTokenRow() used to pick
    // with its `ORDER BY updated_at DESC`.
    await queryRunner.query(
      `DELETE FROM "schwab_tokens" t
       USING "schwab_tokens" newer
       WHERE t."user_id" = newer."user_id"
         AND t."updated_at" < newer."updated_at"`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_schwab_tokens_user_id" ON "schwab_tokens" ("user_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "schwab_tokens"
         ADD CONSTRAINT "FK_schwab_tokens_user_id"
         FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "schwab_tokens" DROP CONSTRAINT IF EXISTS "FK_schwab_tokens_user_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_schwab_tokens_user_id"`);
    await queryRunner.query(
      `ALTER TABLE "schwab_tokens" DROP COLUMN IF EXISTS "user_id"`,
    );
  }
}
