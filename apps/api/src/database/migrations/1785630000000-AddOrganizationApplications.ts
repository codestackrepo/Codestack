import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #118 (canonical migration #21) — `organization_applications`.
 *
 * The closed ecosystem is no longer "a superadmin creates a tenant by hand". An
 * institution applies for itself from the public site, a superadmin reviews it, and
 * approval creates the organization, writes its per-role seat caps and mints the
 * admin invite in one transaction.
 *
 * PRE-TENANT AND PRE-ACCOUNT, which is the whole shape of this table. At submission
 * there is no `organizations` row and no `users` row — the applicant is a stranger
 * filling in a form — so it carries NO not-null foreign key to either. That is what
 * distinguishes it from `professor_requests`, which requires an existing `user_id`
 * because it models an in-org member asking for a promotion. `organization_id` is
 * written, nullable, only at approval, purely as the audit link back to what the
 * application produced.
 *
 * `contact_email` is not unique outright. One address may legitimately apply again
 * after a rejection, and an address that already has a CodeStack account may apply on
 * behalf of an institution. What must not happen is the same address holding two
 * simultaneous applications, so the uniqueness is PARTIAL on `status = 'pending'` —
 * the same technique `org_invites` uses for one pending invite per address. Functional
 * on `lower(contact_email)` because case must not create a second slot.
 *
 * NO uniqueness on `organization_name`. Institution names are not unique in reality
 * (several "St. Mary's College" exist), only slugs are, and rejecting a duplicate name
 * on a PUBLIC endpoint would be a tenant-existence oracle: an outsider could discover
 * which universities use CodeStack by submitting names until one bounced. The
 * superadmin sees possible duplicates at review time instead, which is where a human
 * can tell two real institutions apart.
 *
 * `reviewed_by_id` is ON DELETE SET NULL: removing the superadmin who approved an
 * application must not delete the record of the approval.
 *
 * NOTE — `down()` drops the table, discarding the application history. The
 * organizations, quotas and invites that approvals produced are NOT touched, because
 * they are real tenants with real members; only the paperwork goes.
 */
export class AddOrganizationApplications1785630000000 implements MigrationInterface {
  name = 'AddOrganizationApplications1785630000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "organization_applications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "organization_name" character varying(200) NOT NULL,
        "organization_type" character varying(20) NOT NULL DEFAULT 'university',
        "website" character varying(255),
        "contact_name" character varying(150) NOT NULL,
        "contact_email" character varying(254) NOT NULL,
        "message" text NOT NULL DEFAULT '',
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "reviewed_by_id" uuid,
        "reviewed_at" TIMESTAMP WITH TIME ZONE,
        "decision_reason" text NOT NULL DEFAULT '',
        "organization_id" uuid,
        CONSTRAINT "PK_organization_applications" PRIMARY KEY ("id"),
        CONSTRAINT "chk_org_application_status"
          CHECK ("status" IN ('pending','approved','rejected','withdrawn')),
        -- Mirrors chk_organizations_type minus 'community': nobody applies to create
        -- the platform's own open tenant, and permitting it here would let an
        -- approval mint a second one.
        CONSTRAINT "chk_org_application_type"
          CHECK ("organization_type" IN ('university','organization'))
      )
    `);

    await queryRunner.query(
      `ALTER TABLE "organization_applications" ADD CONSTRAINT "FK_org_application_reviewer" ` +
        `FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_applications" ADD CONSTRAINT "FK_org_application_organization" ` +
        `FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL`,
    );

    // One PENDING application per address. Partial and functional: a rejected
    // applicant may re-apply, and case must not open a second slot.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_org_application_pending_email" ON "organization_applications" ` +
        `(lower("contact_email")) WHERE "status" = 'pending'`,
    );

    // The review queue reads pending-first, newest-first.
    await queryRunner.query(
      `CREATE INDEX "idx_org_application_status" ON "organization_applications" ("status", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_org_application_status"`);
    await queryRunner.query(`DROP INDEX "public"."uq_org_application_pending_email"`);
    await queryRunner.query(
      `ALTER TABLE "organization_applications" DROP CONSTRAINT "FK_org_application_organization"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_applications" DROP CONSTRAINT "FK_org_application_reviewer"`,
    );
    await queryRunner.query(`DROP TABLE "organization_applications"`);
  }
}
