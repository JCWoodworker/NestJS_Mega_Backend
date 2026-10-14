import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSchwabPaperFills1790400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "schwab_paper_fills" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" character varying NOT NULL,
        "client_id" character varying(128) NOT NULL,
        "symbol" character varying(64) NOT NULL,
        "quantity" numeric(18,6) NOT NULL,
        "price" numeric(18,6) NOT NULL,
        "at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "side" character varying(8) NOT NULL,
        "order_type" character varying(16) NOT NULL,
        "open_price" numeric(18,6),
        "opened_at" TIMESTAMP WITH TIME ZONE,
        "realized_pnl" numeric(18,4),
        "exit_reason" character varying(16),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_schwab_paper_fills" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_schwab_paper_fills_user_client" UNIQUE ("user_id", "client_id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_schwab_paper_fills_user_at"
        ON "schwab_paper_fills" ("user_id", "at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_schwab_paper_fills_user_at"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "schwab_paper_fills"`);
  }
}
