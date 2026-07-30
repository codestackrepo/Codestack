import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #101 (canonical migration #11) — turns the Clerk invitation MIRROR created by
 * 1785470000000 into the real, first-party invite table.
 *
 * Every existing row is a mirror of a Clerk invitation keyed on
 * `clerk_invitation_id`, and Clerk is going away, so they are all deleted rather
 * than migrated: there is no local token to reconstruct and the Clerk-side
 * invitation can no longer be accepted.
 *
 * Three shape decisions are load-bearing:
 *
 * 1. `token_hash`, never a token. The raw token exists only as a local variable,
 *    a mail body, a URL and a request body — never a column, never a log line,
 *    never a response field. 64 lowercase hex is CHECK-enforced so a truncated or
 *    upper-cased hash cannot be stored and then never match.
 *
 * 2. `expired` is a STORED status, not a derived one. A partial index predicate
 *    cannot contain `now()`, so "derive expiry at read time" plus
 *    `uq_org_invites_org_pending_email` would leave a timed-out invite forever
 *    occupying its address's one pending slot — permanently bricking re-invites.
 *    A sweep flips `pending -> expired`; seat counting still applies
 *    `status='pending' AND expires_at > now()` so an unswept row never over-holds.
 *
 * 3. `uq_org_invites_org_pending_email` is the concurrency defence, not a nicety.
 *    `assertWithinQuota` returns early holding NO LOCK for an UNCAPPED org, so for
 *    those tenants this partial unique index is the only thing that stops two
 *    concurrent bulk commits from minting duplicate pending invites for the same
 *    address. It is `lower(email)` because addresses are compared case-insensitively.
 *
 * `chk_org_invites_role` is left exactly as 1785470000000 wrote it and is still
 * correct: `superadmin` is deliberately not invitable, at any tier.
 *
 * NOTE — UNRECOVERABLE, BOTH DIRECTIONS. `up()` deletes every mirrored row.
 * `down()` is worse than lossy: it must delete the table's contents again, because
 * a `token_hash` cannot be un-hashed back into `clerk_invitation_id` and that
 * column is NOT NULL with no default. The rollback story for this release is
 * restore-from-backup, not `migration:revert`.
 */
export class ReshapeOrgInvites1785530000000 implements MigrationInterface {
  name = 'ReshapeOrgInvites1785530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Every row is a Clerk mirror with no local token — nothing here is salvageable.
    const rows = (await queryRunner.query(`SELECT COUNT(*)::text AS count FROM "org_invites"`)) as {
      count: string;
    }[];
    const count = rows[0]?.count ?? '0';
    queryRunner.connection.logger.log(
      'info',
      `ReshapeOrgInvites: deleting ${count} mirrored Clerk invitation row(s) — not migratable`,
      queryRunner,
    );
    await queryRunner.query(`DELETE FROM "org_invites"`);

    // 1. drop the Clerk idempotency key
    await queryRunner.query(`DROP INDEX "public"."uq_org_invites_clerk_invitation"`);
    await queryRunner.query(`ALTER TABLE "org_invites" DROP COLUMN "clerk_invitation_id"`);

    // 2. the invite's own identity and lifecycle. token_hash/expires_at are NOT
    //    NULL with no default — safe only because the table was just emptied.
    await queryRunner.query(`
      ALTER TABLE "org_invites"
        ADD COLUMN "token_hash"   character varying(64) NOT NULL,
        ADD COLUMN "kind"         character varying(20) NOT NULL DEFAULT 'new_account',
        ADD COLUMN "expires_at"   TIMESTAMP WITH TIME ZONE NOT NULL,
        ADD COLUMN "accepted_at"  TIMESTAMP WITH TIME ZONE,
        ADD COLUMN "revoked_at"   TIMESTAMP WITH TIME ZONE,
        ADD COLUMN "last_sent_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN "send_count"   integer NOT NULL DEFAULT 0,
        ADD COLUMN "first_name"   character varying(150),
        ADD COLUMN "last_name"    character varying(150),
        ADD COLUMN "invited_by_id" uuid,
        ADD COLUMN "source"       character varying(20) NOT NULL DEFAULT 'manual',
        ADD COLUMN "batch_id"     uuid
    `);

    // 3. discriminators: varchar + CHECK throughout (house style, never a PG enum).
    //    'new_account' mints a fresh account; 'claim' asks an EXISTING unassigned
    //    self-registrant to join — bulk never re-homes an account behind its back.
    await queryRunner.query(
      `ALTER TABLE "org_invites" ADD CONSTRAINT "chk_org_invites_kind" CHECK ("kind" IN ('new_account','claim'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "org_invites" ADD CONSTRAINT "chk_org_invites_source" CHECK ("source" IN ('manual','bulk'))`,
    );
    // Exactly 64 lowercase hex — a sha-256 digest, stored nowhere else.
    await queryRunner.query(
      `ALTER TABLE "org_invites" ADD CONSTRAINT "chk_org_invites_token_hash" CHECK ("token_hash" ~ '^[0-9a-f]{64}$')`,
    );
    await queryRunner.query(
      `ALTER TABLE "org_invites" ADD CONSTRAINT "chk_org_invites_send_count_non_negative" CHECK ("send_count" >= 0)`,
    );
    // Widened from ('pending','accepted','revoked') — 'expired' is now stored.
    await queryRunner.query(`ALTER TABLE "org_invites" DROP CONSTRAINT "chk_org_invites_status"`);
    await queryRunner.query(
      `ALTER TABLE "org_invites" ADD CONSTRAINT "chk_org_invites_status" CHECK ("status" IN ('pending','accepted','revoked','expired'))`,
    );

    // 4. who minted it. SET NULL, not CASCADE: deleting the staff member who sent
    //    an invite must not silently delete the invitee's pending seat.
    await queryRunner.query(
      `ALTER TABLE "org_invites" ADD CONSTRAINT "FK_org_invites_invited_by" ` +
        `FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    );

    // 5. access paths. The pending index gains `expires_at` so the seat-count
    //    predicate (status='pending' AND expires_at > now()) and the expiry sweep
    //    are both index-only rather than a filter over every pending row.
    await queryRunner.query(`DROP INDEX "public"."idx_org_invites_org_pending"`);
    await queryRunner.query(
      `CREATE INDEX "idx_org_invites_org_pending" ON "org_invites" ("organization_id", "expires_at") WHERE "status" = 'pending'`,
    );
    // The accept/claim lookup key — one invite per token, globally.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_org_invites_token_hash" ON "org_invites" ("token_hash")`,
    );
    // See decision 3 in the header: for an uncapped org this is the ONLY thing
    // serialising concurrent invite mints for the same address.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_org_invites_org_pending_email" ON "org_invites" ("organization_id", lower("email")) WHERE "status" = 'pending'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Unavoidable: `clerk_invitation_id` is NOT NULL with no default and cannot be
    // recovered from a hash. See the UNRECOVERABLE note above.
    await queryRunner.query(`DELETE FROM "org_invites"`);

    await queryRunner.query(`DROP INDEX "public"."uq_org_invites_org_pending_email"`);
    await queryRunner.query(`DROP INDEX "public"."uq_org_invites_token_hash"`);
    await queryRunner.query(`DROP INDEX "public"."idx_org_invites_org_pending"`);
    await queryRunner.query(
      `CREATE INDEX "idx_org_invites_org_pending" ON "org_invites" ("organization_id") WHERE "status" = 'pending'`,
    );

    await queryRunner.query(
      `ALTER TABLE "org_invites" DROP CONSTRAINT "FK_org_invites_invited_by"`,
    );

    await queryRunner.query(`ALTER TABLE "org_invites" DROP CONSTRAINT "chk_org_invites_status"`);
    await queryRunner.query(
      `ALTER TABLE "org_invites" ADD CONSTRAINT "chk_org_invites_status" CHECK ("status" IN ('pending','accepted','revoked'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "org_invites" DROP CONSTRAINT "chk_org_invites_send_count_non_negative"`,
    );
    await queryRunner.query(
      `ALTER TABLE "org_invites" DROP CONSTRAINT "chk_org_invites_token_hash"`,
    );
    await queryRunner.query(`ALTER TABLE "org_invites" DROP CONSTRAINT "chk_org_invites_source"`);
    await queryRunner.query(`ALTER TABLE "org_invites" DROP CONSTRAINT "chk_org_invites_kind"`);

    await queryRunner.query(`
      ALTER TABLE "org_invites"
        DROP COLUMN "batch_id",
        DROP COLUMN "source",
        DROP COLUMN "invited_by_id",
        DROP COLUMN "last_name",
        DROP COLUMN "first_name",
        DROP COLUMN "send_count",
        DROP COLUMN "last_sent_at",
        DROP COLUMN "revoked_at",
        DROP COLUMN "accepted_at",
        DROP COLUMN "expires_at",
        DROP COLUMN "kind",
        DROP COLUMN "token_hash"
    `);

    await queryRunner.query(
      `ALTER TABLE "org_invites" ADD COLUMN "clerk_invitation_id" character varying(120) NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_org_invites_clerk_invitation" ON "org_invites" ("clerk_invitation_id")`,
    );
  }
}
