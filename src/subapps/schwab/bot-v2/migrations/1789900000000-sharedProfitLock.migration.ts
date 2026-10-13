import { MigrationInterface, QueryRunner } from 'typeorm';

const COLUMNS = [
  ['loss_cut_pct', '12'],
  ['protect_arm_pct', '8'],
  ['protect_floor_pct', '2'],
  ['giveback_pct', '6'],
  ['tight_from_pct', '20'],
  ['tight_giveback_pct', '4'],
] as const;

export class SharedProfitLock1789900000000 implements MigrationInterface {
  name = 'SharedProfitLock1789900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['bot_settings', 'bot_v2_settings']) {
      for (const [name, fallback] of COLUMNS) {
        await queryRunner.query(
          `ALTER TABLE "${table}" ADD "${name}" numeric(8,4) NOT NULL DEFAULT ${fallback}`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['bot_settings', 'bot_v2_settings']) {
      for (const [name] of COLUMNS) {
        await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "${name}"`);
      }
    }
  }
}
