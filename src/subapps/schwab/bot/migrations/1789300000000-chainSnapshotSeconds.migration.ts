import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Widen the chain snapshot wall-clock label to hold seconds.
 *
 * Column type only — existing `HH:MM` rows stay valid and readable, they just
 * describe a minute-resolution era of the recording.
 */
export class ChainSnapshotSeconds1789300000000 implements MigrationInterface {
  name = 'ChainSnapshotSeconds1789300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bot_chain_snapshots" ALTER COLUMN "et_hhmm" TYPE varchar(8)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Narrowing would fail outright on any HH:MM:SS row, so trim first.
    await queryRunner.query(
      `UPDATE "bot_chain_snapshots" SET "et_hhmm" = left("et_hhmm", 5)`,
    );
    await queryRunner.query(
      `ALTER TABLE "bot_chain_snapshots" ALTER COLUMN "et_hhmm" TYPE varchar(5)`,
    );
  }
}
