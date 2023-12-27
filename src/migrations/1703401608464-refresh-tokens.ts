import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefreshTokens1703401608464 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    queryRunner.query(
      `CREATE TABLE "RefreshTokens" (
                "id" SERIAL NOT NULL PRIMARY KEY,
                "userId" integer NOT NULL UNIQUE,
                "tokenId" character varying NOT NULL UNIQUE)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    queryRunner.query(`DROP TABLE IF EXISTS "RefreshTokens"`);
  }
}
