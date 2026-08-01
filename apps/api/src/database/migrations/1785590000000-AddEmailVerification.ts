import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #118 (canonical migration #17) — email verification.
 *
 * The app has never had any: `POST /auth/register` created a student with a
 * password and signed them straight in, so an address nobody could read was
 * indistinguishable from one the owner controls. Self-signup is about to become a
 * real entry path (open students, then open professors), which makes an unverified
 * address a way to occupy someone else's identity — so the machinery lands before
 * the flows that need it.
 *
 * Two pieces: a nullable stamp on `users`, and a token table.
 *
 * THE BACKFILL IS THE LOAD-BEARING PART. Every existing row is stamped
 * `email_verified_at = created_at`, which grandfathers the entire user base as
 * verified. Without it, adding the column would lock every existing account out
 * the moment the login gate ships — a migration that takes down the platform. The
 * stamp is `created_at` rather than `now()` deliberately: `now()` would assert that
 * every account was verified at deploy time, which is false and would poison any
 * later question about when verification actually happened. `created_at` at least
 * says "as old as the account", which is the truth: these accounts predate
 * verification entirely.
 *
 * Existing accounts are safe to grandfather because each already arrived by a path
 * that proves or vouches for the mailbox: an invite whose token was mailed and
 * clicked, or staff creation inside a tenant. The unproven path is the one that
 * does not exist yet.
 *
 * NOTE — `down()` is destructive and says so. Dropping the column discards which
 * addresses were verified, and there is no way to reconstruct it: re-running `up()`
 * would re-grandfather everyone, including accounts that had never verified. That is
 * acceptable for a rollback (it restores the pre-#118 posture, where nothing was
 * verified and nothing checked) but it is not reversible in the information sense.
 */
export class AddEmailVerification1785590000000 implements MigrationInterface {
  name = 'AddEmailVerification1785590000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Adding a NULLABLE column with no default is metadata-only in Postgres — no
    // table rewrite, no long ACCESS EXCLUSIVE hold, safe on a live table.
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "email_verified_at" TIMESTAMP WITH TIME ZONE`,
    );

    // Single pass. At this project's scale `users` is small enough that one UPDATE
    // is fine; if it ever isn't, batch by id range rather than widening the lock.
    await queryRunner.query(
      `UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL`,
    );

    // Answers "who has never verified?" — the support and cleanup question — without
    // scanning the whole table. Partial, because verified rows are the overwhelming
    // majority and are never the subject of that query.
    await queryRunner.query(
      `CREATE INDEX "idx_user_unverified" ON "users" ("created_at" DESC) WHERE "email_verified_at" IS NULL`,
    );

    // Shape mirrors `password_reset_tokens` (1785550000000) column for column, and
    // that parallel is deliberate: same 64-hex CHECK, same unique index, same
    // partial live-token index, same CASCADE. The two tables are consumed by
    // near-identical services, and keeping them structurally identical is what stops
    // one from quietly growing a weaker guarantee than the other.
    await queryRunner.query(`
      CREATE TABLE "email_verification_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "token_hash" character varying(64) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "used_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_email_verification_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "chk_email_verif_token_hash" CHECK ("token_hash" ~ '^[0-9a-f]{64}$')
      )
    `);

    await queryRunner.query(
      `ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "FK_email_verification_tokens_user" ` +
        `FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE`,
    );

    // The consume path's only access route: one indexed probe on the hash.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_email_verif_token_hash" ON "email_verification_tokens" ("token_hash")`,
    );

    // Minting a new token invalidates every live one for that user; this is that
    // sweep's access path, and re-requesting a verification mail is common enough
    // (a mistyped address, a mail that went to spam) for it to matter.
    await queryRunner.query(
      `CREATE INDEX "idx_email_verif_live_by_user" ON "email_verification_tokens" ("user_id") WHERE "used_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_email_verif_live_by_user"`);
    await queryRunner.query(`DROP INDEX "public"."uq_email_verif_token_hash"`);
    await queryRunner.query(
      `ALTER TABLE "email_verification_tokens" DROP CONSTRAINT "FK_email_verification_tokens_user"`,
    );
    await queryRunner.query(`DROP TABLE "email_verification_tokens"`);
    await queryRunner.query(`DROP INDEX "public"."idx_user_unverified"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email_verified_at"`);
  }
}
