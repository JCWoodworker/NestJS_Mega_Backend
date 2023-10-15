import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserType1697344442768 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "userGroup" character varying NOT NULL DEFAULT 'basic'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "userGroup"`);
  }
}
