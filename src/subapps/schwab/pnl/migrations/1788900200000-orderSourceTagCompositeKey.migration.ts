import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Widens `schwab_order_source_tags` to a composite key of
 * (order_id, account_hash).
 *
 * Schwab order ids are unique per account, not globally. With one account
 * that distinction never mattered; with many, two users' orders can share an
 * id and the second tag would overwrite the first — mislabelling a manual
 * trade as a bot trade in history, or the reverse.
 */
export class OrderSourceTagCompositeKey1788900200000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "schwab_order_source_tags"
         DROP CONSTRAINT IF EXISTS "PK_schwab_order_source_tags"`,
    );
    // TypeORM's generated name for the original single-column key varies by
    // creation path, so drop whichever primary key is actually present.
    await queryRunner.query(
      `DO $$
       DECLARE pk_name text;
       BEGIN
         SELECT conname INTO pk_name
         FROM pg_constraint
         WHERE conrelid = '"schwab_order_source_tags"'::regclass
           AND contype = 'p';
         IF pk_name IS NOT NULL THEN
           EXECUTE format(
             'ALTER TABLE "schwab_order_source_tags" DROP CONSTRAINT %I',
             pk_name
           );
         END IF;
       END $$`,
    );

    await queryRunner.query(
      `ALTER TABLE "schwab_order_source_tags"
         ALTER COLUMN "account_hash" SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "schwab_order_source_tags"
         ADD CONSTRAINT "PK_schwab_order_source_tags"
         PRIMARY KEY ("order_id", "account_hash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "schwab_order_source_tags"
         DROP CONSTRAINT IF EXISTS "PK_schwab_order_source_tags"`,
    );
    // Collapse duplicates that the composite key permitted but a
    // single-column key cannot hold.
    await queryRunner.query(
      `DELETE FROM "schwab_order_source_tags" t
       USING "schwab_order_source_tags" newer
       WHERE t."order_id" = newer."order_id"
         AND t."created_at" < newer."created_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "schwab_order_source_tags"
         ADD CONSTRAINT "PK_schwab_order_source_tags"
         PRIMARY KEY ("order_id")`,
    );
  }
}
