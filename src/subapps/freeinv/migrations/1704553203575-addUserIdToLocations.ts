import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserIdToLocations1704553203575 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "locations" ADD "userId" character varying NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "locations" DROP COLUMN "userId"`);
  }
}
