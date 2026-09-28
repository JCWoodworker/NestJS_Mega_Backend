import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Re-key `bot_market_days` by the session its bars actually describe.
 *
 * The backfill used to request the previous completed session and store it
 * under the current date, so every row was one session out of step, and a
 * weekend re-run filed the same Friday under Saturday, Sunday and Monday.
 * Nothing ever failed — an entry replay would simply have read the wrong
 * day's tape.
 *
 * Safe to run on a repaired table: rows already keyed correctly map to
 * themselves and are rewritten unchanged. `full_session` is recomputed from
 * regular-hours bars, since the stored series includes pre- and post-market
 * and the old count could not tell a short session from a long one.
 *
 * This table is derived data — anything it drops is re-fetchable from Schwab
 * price history by the backfill.
 */
export class RepairMarketDayKeys1789300100000 implements MigrationInterface {
  name = 'RepairMarketDayKeys1789300100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TEMP TABLE repaired_market_days ON COMMIT DROP AS
      SELECT DISTINCT ON (true_date)
        true_date AS et_date_key,
        symbol,
        bars,
        jsonb_array_length(bars) AS bar_count,
        rth_bars >= 380 AS full_session,
        created_at
      FROM (
        SELECT
          m.symbol,
          m.bars,
          m.created_at,
          m.et_date_key AS old_key,
          to_char(
            (to_timestamp(((m.bars->0->>0)::bigint) / 1000)
              AT TIME ZONE 'America/New_York')::date,
            'YYYY-MM-DD'
          ) AS true_date,
          (
            SELECT count(*)
            FROM jsonb_array_elements(m.bars) AS bar
            WHERE (to_timestamp(((bar->>0)::bigint) / 1000)
                    AT TIME ZONE 'America/New_York')::time >= TIME '09:30'
              AND (to_timestamp(((bar->>0)::bigint) / 1000)
                    AT TIME ZONE 'America/New_York')::time < TIME '16:00'
          ) AS rth_bars
        FROM bot_market_days m
        WHERE jsonb_array_length(m.bars) > 0
      ) s
      -- Duplicates of one session are identical refetches; keep the earliest
      -- key so the choice is deterministic rather than whatever scan order.
      ORDER BY true_date, old_key
    `);

    await queryRunner.query(`DELETE FROM bot_market_days`);

    await queryRunner.query(`
      INSERT INTO bot_market_days
        (et_date_key, symbol, bars, bar_count, full_session, created_at, updated_at)
      SELECT et_date_key, symbol, bars, bar_count, full_session, created_at, now()
      FROM repaired_market_days
    `);
  }

  public async down(): Promise<void> {
    // Deliberately empty. Reversing this would mean re-misfiling each session
    // under a neighbouring date, and the correct rows are what every reader
    // now expects.
  }
}
