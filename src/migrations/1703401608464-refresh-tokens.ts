import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefreshTokens1703401608464 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    queryRunner.query(
      `CREATE TABLE "refresh_tokens" (
                "id" SERIAL NOT NULL PRIMARY KEY,
                "userId" integer NOT NULL UNIQUE,
                "tokenId" character varying NOT NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
  }
}
