import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The SPXW house trainer stops arming new entries at 14:45 ET (documented in
 * frontend notes). Rows that still had the table default 15:00 picked up late
 * gamma chop the book does not trade on purpose.
 */
export class TrainerSpxwTradeWindowEnd1790200000000 implements MigrationInterface {
  name = 'TrainerSpxwTradeWindowEnd1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "bot_v2_settings"
      SET "trade_window_end" = '14:45'
      WHERE "bot_underlying" = 'SPXW'
        AND "trade_window_end" = '15:00'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "bot_v2_settings"
      SET "trade_window_end" = '15:00'
      WHERE "bot_underlying" = 'SPXW'
        AND "trade_window_end" = '14:45'
    `);
  }
}
