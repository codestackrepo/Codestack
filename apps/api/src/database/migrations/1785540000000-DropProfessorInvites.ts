import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #101 (canonical migration #12) — drops `professor_invites`, created by
 * 1784700000000 and superseded by the first-party invite engine on `org_invites`
 * (1785530000000). `professor_requests`, its sibling in that migration, is NOT
 * touched: self-service professor-access requests are a separate feature.
 *
 * The table is already unusable rather than merely redundant:
 *  - `token` is a PLAINTEXT bearer credential, readable by anyone with a SELECT;
 *  - it has no `organization_id`, so it cannot express which tenant is inviting;
 *  - its consumption path mints an org-less PROFESSOR, which
 *    `chk_users_org_required` forbids (it rejects a non-superadmin with a NULL
 *    org in every form the constraint has ever taken, including the CASE rewrite
 *    in 1785520000000 — only STUDENT gained the exemption).
 *
 * Postgres drops the table's 3 indexes and 2 FK constraints with it, so `up()` is
 * one statement.
 *
 * NOTE — UNRECOVERABLE: `down()` restores the table STRUCTURE byte-identically to
 * 1784700000000's definition. Every invite row — token, invitee, consumer,
 * timestamps — is gone, and nothing left in the database can reconstruct it.
 *
 * NOTE — DEPLOY ORDER: this one is NOT migrate-then-restart. Unlike the other
 * three, the code that reads this table is still live at the time this migration
 * lands (`modules/onboarding` mints/lists/previews/revokes invites and
 * `modules/admin` counts pending ones), so it must stop reading `professor_invites`
 * BEFORE this runs or those endpoints answer 42P01. The reader is removed with the
 * invite engine (#104); until then this migration must not be applied to an
 * environment serving traffic.
 */
export class DropProfessorInvites1785540000000 implements MigrationInterface {
  name = 'DropProfessorInvites1785540000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "professor_invites"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Byte-identical to the definition in 1784700000000-AddOnboardingTables.
    await queryRunner.query(`
      CREATE TABLE "professor_invites" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "token" character varying(64) NOT NULL,
        "email" character varying(254),
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "invited_by_id" uuid,
        "consumed_by_id" uuid,
        "expires_at" TIMESTAMP WITH TIME ZONE,
        "consumed_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_professor_invites" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_prof_invite_token" ON "professor_invites" ("token")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_prof_invite_status" ON "professor_invites" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_prof_invite_invited_by" ON "professor_invites" ("invited_by_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "professor_invites" ADD CONSTRAINT "FK_prof_invite_invited_by" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "professor_invites" ADD CONSTRAINT "FK_prof_invite_consumed_by" FOREIGN KEY ("consumed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }
}
