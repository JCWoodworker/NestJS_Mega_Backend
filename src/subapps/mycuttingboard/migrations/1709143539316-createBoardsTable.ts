import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBoardsTable1709143539316 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query();
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query();
  }
}
