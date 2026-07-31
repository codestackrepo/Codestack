import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #107 (canonical migration #13) — `password_reset_tokens`.
 *
 * The app has had NO credential recovery since the third-party provider was
 * excised (#102), and #105 made `PATCH /users/:id {password}` self-only because a
 * staff-set password is an account-takeover primitive. Between those two, a
 * forgotten password is currently unrecoverable for everyone except a SuperAdmin,
 * who can be reset out-of-band via `seed:superadmin`. This table closes that.
 *
 * Shape mirrors `org_invites`' token columns exactly, deliberately: same 64-hex
 * CHECK, same unique index, same "hash at rest, plaintext only in the mail"
 * contract. A reader who has understood one understands the other, and the
 * invite token util is reused unchanged.
 *
 * `ON DELETE CASCADE` on the user: a deleted account's outstanding reset links
 * must die with it, or a token minted moments before deletion would survive as a
 * dangling credential for a row that no longer exists.
 *
 * NOTE — `down()` is symmetric and drops the table with its indexes. Any live
 * reset link is destroyed, which is correct: they are single-use, 60-minute
 * credentials, and preserving them across a schema rollback has no value.
 */
export class AddPasswordResetTokens1785550000000 implements MigrationInterface {
  name = 'AddPasswordResetTokens1785550000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "password_reset_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "token_hash" character varying(64) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "used_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_password_reset_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "chk_password_reset_token_hash" CHECK ("token_hash" ~ '^[0-9a-f]{64}$')
      )
    `);

    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "FK_password_reset_tokens_user" ` +
        `FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE`,
    );

    // The consume path's only access route: one indexed probe, no application-level
    // string comparison, so there is nothing to make constant-time.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_password_reset_token_hash" ON "password_reset_tokens" ("token_hash")`,
    );

    // Partial: minting a new token invalidates every LIVE one for that user, and
    // this index is that sweep's access path. Used rows are the overwhelming
    // majority over time and are never swept again, so they stay out of it.
    await queryRunner.query(
      `CREATE INDEX "idx_password_reset_live_by_user" ON "password_reset_tokens" ("user_id") WHERE "used_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_password_reset_live_by_user"`);
    await queryRunner.query(`DROP INDEX "public"."uq_password_reset_token_hash"`);
    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "FK_password_reset_tokens_user"`,
    );
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
  }
}
