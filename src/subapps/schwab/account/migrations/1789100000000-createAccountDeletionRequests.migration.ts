import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAccountDeletionRequests1789100000000
  implements MigrationInterface
{
  name = 'CreateAccountDeletionRequests1789100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "schwab_account_deletion_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" character varying NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'pending',
        "reason" text,
        "email_export" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "resolved_at" TIMESTAMPTZ,
        "resolved_by" character varying,
        "resolution_note" text,
        CONSTRAINT "PK_schwab_account_deletion_requests" PRIMARY KEY ("id"),
        CONSTRAINT "FK_deletion_requests_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_deletion_requests_user_status"
        ON "schwab_account_deletion_requests" ("user_id", "status")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_deletion_requests_one_pending_per_user"
        ON "schwab_account_deletion_requests" ("user_id")
        WHERE "status" = 'pending'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_deletion_requests_one_pending_per_user"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_deletion_requests_user_status"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "schwab_account_deletion_requests"`,
    );
  }
}
