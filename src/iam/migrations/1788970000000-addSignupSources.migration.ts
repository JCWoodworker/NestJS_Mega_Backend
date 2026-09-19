import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-app identity on the shared `users` table. Each product stamps its
 * slug into `signup_sources` on signup/Google; Strikedesk admin filters to
 * rows that contain `strikedesk`.
 */
export class AddSignupSources1788970000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signup_sources" text[] NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_signup_sources" ON "users" USING GIN ("signup_sources")`,
    );

    // Known Strikedesk accounts.
    await queryRunner.query(
      `UPDATE "users" SET "signup_sources" = ARRAY['strikedesk']::text[]
       WHERE lower(email) IN (
         'jfc3303@gmail.com',
         'jc@rilocalwoodworks.com',
         'eduardo.saavedra@brightstarlottery.com'
       )`,
    );

    // Cuttingboard-only account.
    await queryRunner.query(
      `UPDATE "users" SET "signup_sources" = ARRAY['mycuttingboard']::text[]
       WHERE lower(email) = 'pegou60@gmail.com'`,
    );

    // Cross-app admin identity — every known product slug.
    await queryRunner.query(
      `UPDATE "users" SET "signup_sources" = ARRAY[
         'strikedesk',
         'mycuttingboard',
         'mywoodapp',
         'onlybizlinks',
         'rilw',
         'woodpricing',
         'fantasy-war-room'
       ]::text[]
       WHERE lower(email) = 'admin@test.com'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_users_signup_sources"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "signup_sources"`,
    );
  }
}
