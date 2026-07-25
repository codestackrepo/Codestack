import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #52 — Local mirror of Clerk Organization Invitations, synced by the Clerk
 * webhook. It is NOT the invitation authority (Clerk is); it exists so quota
 * seat-counting (#65/#66) can read "active users + pending non-expired invites"
 * without a live Clerk call. Idempotent upserts key on `clerk_invitation_id`
 * (UNIQUE), so a redelivered `organizationInvitation.*` webhook never
 * double-counts a seat.
 *
 * Timestamp continues the round-epoch platform sequence after 1785460000000
 * (AddClerkIdentityToUsers).
 */
export class AddOrgInvitesMirror1785470000000 implements MigrationInterface {
  name = 'AddOrgInvitesMirror1785470000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "org_invites" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "clerk_invitation_id" character varying(120) NOT NULL,
        "email" character varying(254) NOT NULL,
        "role" character varying(20) NOT NULL DEFAULT 'student',
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        CONSTRAINT "PK_org_invites" PRIMARY KEY ("id"),
        CONSTRAINT "chk_org_invites_role" CHECK ("role" IN ('admin','professor','student')),
        CONSTRAINT "chk_org_invites_status" CHECK ("status" IN ('pending','accepted','revoked'))
      )
    `);
    // The idempotency key — one row per Clerk invitation, upserted on conflict.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_org_invites_clerk_invitation" ON "org_invites" ("clerk_invitation_id")`,
    );
    // Seat-counting reads pending invites per org (partial: only the pending ones).
    await queryRunner.query(
      `CREATE INDEX "idx_org_invites_org_pending" ON "org_invites" ("organization_id") WHERE "status" = 'pending'`,
    );
    await queryRunner.query(
      `ALTER TABLE "org_invites" ADD CONSTRAINT "FK_org_invites_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "org_invites" DROP CONSTRAINT "FK_org_invites_organization"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_org_invites_org_pending"`);
    await queryRunner.query(`DROP INDEX "public"."uq_org_invites_clerk_invitation"`);
    await queryRunner.query(`DROP TABLE "org_invites"`);
  }
}
