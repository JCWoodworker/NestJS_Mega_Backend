import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRestaurantsTable1728699473766 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        CREATE TABLE restaurants (
            id SERIAL NOT NULL PRIMARY KEY,
            name character varying NOT NULL,
            logoUrl character varying
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS restaurants`);
  }
}
