import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #118 (canonical migration #22) — `professor_applications`, plus the invite source
 * that approving one produces.
 *
 * An educator with no institution applies to teach on the open platform; a CodeStack
 * superadmin reviews it; approval mints an ordinary PROFESSOR invite into the community
 * tenant, which they accept and set a password on.
 *
 * NOT `professor_requests`, and the distinction is the reason this table exists at all:
 *
 *   professor_requests      an EXISTING member of a tenant asks to be promoted inside
 *                           it. NOT NULL `user_id`; reviewed by that org's ADMIN;
 *                           approval calls `setRole`.
 *   professor_applications  a STRANGER asks to join the open platform as a professor.
 *                           No account exists yet, so no `user_id`; reviewed by the
 *                           PLATFORM superadmin; approval mints an invite.
 *
 * Different FK shapes, different uniqueness keys, different reviewers, different
 * side-effects. One discriminated table would make every column nullable and every
 * query conditional, so they stay separate — and the `*_applications` / `*_requests`
 * naming is what makes which-is-which legible: an application is a pre-account public
 * ask reviewed on the platform console, a request is an in-org ask reviewed in the org
 * console.
 *
 * Uniqueness is PARTIAL on `status = 'pending'`, functional on `lower(email)`: one live
 * application per address, but a rejected applicant may apply again and case cannot
 * open a second slot. Same technique as `org_invites` and `organization_applications`.
 *
 * The second half widens `chk_org_invites_source`. `source` was `('manual','bulk')`;
 * an invite minted by approving an application is neither, and recording it as
 * `manual` would lie about where it came from — the provenance is the point of the
 * column.
 *
 * NOTE — `down()` narrows the source CHECK, so it must first rewrite any
 * `application` rows. It sets them to `manual`, which LOSES provenance; the
 * alternative (deleting them) would destroy live invites people are holding, and a
 * slightly-wrong source is better than a revoked credential.
 */
export class AddProfessorApplications1785640000000 implements MigrationInterface {
  name = 'AddProfessorApplications1785640000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "professor_applications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "email" character varying(254) NOT NULL,
        "first_name" character varying(150) NOT NULL,
        "last_name" character varying(150) NOT NULL,
        "institution" character varying(200),
        "message" text NOT NULL DEFAULT '',
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "reviewed_by_id" uuid,
        "reviewed_at" TIMESTAMP WITH TIME ZONE,
        "decision_reason" text NOT NULL DEFAULT '',
        "invite_id" uuid,
        CONSTRAINT "PK_professor_applications" PRIMARY KEY ("id"),
        CONSTRAINT "chk_professor_application_status"
          CHECK ("status" IN ('pending','approved','rejected','withdrawn'))
      )
    `);

    await queryRunner.query(
      `ALTER TABLE "professor_applications" ADD CONSTRAINT "FK_professor_application_reviewer" ` +
        `FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
    // SET NULL rather than CASCADE: an invite that expires and is cleaned up must not
    // delete the record that it was ever approved.
    await queryRunner.query(
      `ALTER TABLE "professor_applications" ADD CONSTRAINT "FK_professor_application_invite" ` +
        `FOREIGN KEY ("invite_id") REFERENCES "org_invites"("id") ON DELETE SET NULL`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_professor_application_pending_email" ON "professor_applications" ` +
        `(lower("email")) WHERE "status" = 'pending'`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_professor_application_status" ON "professor_applications" ("status", "created_at" DESC)`,
    );

    // An invite minted by approving an application is neither manual nor bulk.
    await queryRunner.query(`ALTER TABLE "org_invites" DROP CONSTRAINT "chk_org_invites_source"`);
    await queryRunner.query(
      `ALTER TABLE "org_invites" ADD CONSTRAINT "chk_org_invites_source" ` +
        `CHECK ("source" IN ('manual','bulk','application'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Must precede the narrower CHECK or ADD CONSTRAINT fails 23514. Rewriting rather
    // than deleting: these are live invites somebody may be holding.
    await queryRunner.query(
      `UPDATE "org_invites" SET "source" = 'manual' WHERE "source" = 'application'`,
    );
    await queryRunner.query(`ALTER TABLE "org_invites" DROP CONSTRAINT "chk_org_invites_source"`);
    await queryRunner.query(
      `ALTER TABLE "org_invites" ADD CONSTRAINT "chk_org_invites_source" ` +
        `CHECK ("source" IN ('manual','bulk'))`,
    );

    await queryRunner.query(`DROP INDEX "public"."idx_professor_application_status"`);
    await queryRunner.query(`DROP INDEX "public"."uq_professor_application_pending_email"`);
    await queryRunner.query(
      `ALTER TABLE "professor_applications" DROP CONSTRAINT "FK_professor_application_invite"`,
    );
    await queryRunner.query(
      `ALTER TABLE "professor_applications" DROP CONSTRAINT "FK_professor_application_reviewer"`,
    );
    await queryRunner.query(`DROP TABLE "professor_applications"`);
  }
}
