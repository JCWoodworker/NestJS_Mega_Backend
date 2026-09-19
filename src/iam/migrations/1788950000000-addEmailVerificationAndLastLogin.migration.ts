import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Email verification shipped after real users had already signed up under
 * the old flow, and none of them should lose access for a control that
 * didn't exist yet — so every pre-existing row is backfilled to verified.
 * Only new signups from this point on start unverified.
 */
export class AddEmailVerificationAndLastLogin1788950000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_email_verified" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMPTZ`,
    );

    // Grandfather every row that exists as of this migration. Anything
    // inserted after this line defaults to false and earns verification the
    // normal way.
    await queryRunner.query(
      `UPDATE "users" SET "is_email_verified" = true WHERE "is_email_verified" = false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "last_login_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "is_email_verified"`,
    );
  }
}
