import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #51 — Clerk identity linkage on `users` for dual-auth (Clerk verified alongside
 * the existing JWT). Adds nullable clerk_user_id with a PARTIAL unique index
 * (JWT-only rows keep NULL and never collide) and drops password_hash NOT NULL so
 * Clerk-managed accounts (no local password) can exist.
 */
export class AddClerkIdentityToUsers1785460000000 implements MigrationInterface {
  name = 'AddClerkIdentityToUsers1785460000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "clerk_user_id" character varying(255)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_user_clerk_user_id" ON "users" ("clerk_user_id") WHERE "clerk_user_id" IS NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // NOTE: re-adding NOT NULL fails once any Clerk-only (null-hash) row exists —
    // this rollback is clean only BEFORE any Clerk account has been provisioned.
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL`);
    await queryRunner.query(`DROP INDEX "public"."idx_user_clerk_user_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "clerk_user_id"`);
  }
}
