import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes the bot per-user.
 *
 * Existing rows are the owner's, so they are backfilled to
 * `SCHWAB_OWNER_USER_ID` rather than dropped — deleting them would reset the
 * paper equity curve and discard the improvement loop's accumulated corpus,
 * which is unrecoverable (see the createBotAnalyticsTables migration note).
 *
 * `bot_market_days` and `bot_chain_snapshots` deliberately get no user
 * column: they hold SPY bars and option-chain snapshots, which are market
 * data and identical for everyone.
 */
export class AddUserIdToBotTables1788900300000 implements MigrationInterface {
  private readonly tables = [
    'bot_state',
    'bot_settings',
    'bot_events',
    'bot_trades',
    'bot_trade_tape',
    'bot_capital_events',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const ownerUserId = process.env.SCHWAB_OWNER_USER_ID?.trim();
    let owner: { id: string } | undefined;
    if (ownerUserId) {
      [owner] = await queryRunner.query(
        `SELECT "id" FROM "users" WHERE "id" = $1`,
        [ownerUserId],
      );
    }

    for (const table of this.tables) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN "user_id" character varying`,
      );

      if (owner) {
        await queryRunner.query(
          `UPDATE "${table}" SET "user_id" = $1 WHERE "user_id" IS NULL`,
          [ownerUserId],
        );
      }

      // Rows with no attributable owner cannot be read by any request and
      // cannot be trusted in the corpus, so they are removed rather than
      // left behind NOT NULL-incompatible.
      await queryRunner.query(`DELETE FROM "${table}" WHERE "user_id" IS NULL`);

      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "user_id" SET NOT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}"
           ADD CONSTRAINT "FK_${table}_user_id"
           FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE`,
      );
    }

    // One control-plane and one settings row per user. Collapse any existing
    // duplicates first, keeping the freshest — matching what the old
    // `take: 1, order: updated_at DESC` read would have picked.
    for (const table of ['bot_state', 'bot_settings']) {
      await queryRunner.query(
        `DELETE FROM "${table}" t
         USING "${table}" newer
         WHERE t."user_id" = newer."user_id"
           AND t."updated_at" < newer."updated_at"`,
      );
      await queryRunner.query(
        `CREATE UNIQUE INDEX "UQ_${table}_user_id" ON "${table}" ("user_id")`,
      );
    }

    // trade_key is only unique within an account: two users can open the
    // same contract in the same millisecond.
    //
    // The old uniqueness may exist either as a standalone index or as a
    // UNIQUE *constraint* — TypeORM creates it as a constraint. Postgres
    // refuses DROP INDEX on a constraint-backed index with 2BP01 ("you can
    // drop constraint ... instead"), which failed this migration on the first
    // deploy. Check pg_constraint first, and only fall back to DROP INDEX for
    // a genuinely standalone index.
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bot_trades_trade_key"`);
    await queryRunner.query(
      `DO $$
       DECLARE obj_name text;
       BEGIN
         SELECT conname INTO obj_name
         FROM pg_constraint
         WHERE conrelid = 'bot_trades'::regclass
           AND contype = 'u'
           AND pg_get_constraintdef(oid) LIKE '%trade_key%'
           AND pg_get_constraintdef(oid) NOT LIKE '%user_id%';

         IF obj_name IS NOT NULL THEN
           EXECUTE format(
             'ALTER TABLE "bot_trades" DROP CONSTRAINT %I', obj_name
           );
           RETURN;
         END IF;

         SELECT indexname INTO obj_name
         FROM pg_indexes
         WHERE tablename = 'bot_trades'
           AND indexdef LIKE '%UNIQUE%'
           AND indexdef LIKE '%trade_key%'
           AND indexdef NOT LIKE '%user_id%';

         IF obj_name IS NOT NULL THEN
           EXECUTE format('DROP INDEX %I', obj_name);
         END IF;
       END $$`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_bot_trades_user_trade_key"
         ON "bot_trades" ("user_id", "trade_key")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_bot_trade_tape_user_trade_at"
         ON "bot_trade_tape" ("user_id", "trade_key", "at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bot_events_user_at" ON "bot_events" ("user_id", "at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bot_capital_events_user_at"
         ON "bot_capital_events" ("user_id", "at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_bot_capital_events_user_at"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bot_events_user_at"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_bot_trade_tape_user_trade_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_bot_trades_user_trade_key"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_bot_trades_trade_key"
         ON "bot_trades" ("trade_key")`,
    );

    for (const table of ['bot_state', 'bot_settings']) {
      await queryRunner.query(`DROP INDEX IF EXISTS "UQ_${table}_user_id"`);
    }

    for (const table of this.tables) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "FK_${table}_user_id"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "user_id"`,
      );
    }
  }
}
