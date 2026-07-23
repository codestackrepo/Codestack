import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Professor-onboarding tables:
 *  - professor_invites: admin-minted invitations consumed at registration to
 *    grant the professor role.
 *  - professor_requests: self-service requests for professor access that an
 *    admin approves/rejects.
 *
 * Status columns are varchar (not PG enums) so new states are code-only, per
 * the project's newer convention (see NotificationTypeToVarchar).
 */
export class AddOnboardingTables1784700000000 implements MigrationInterface {
  name = 'AddOnboardingTables1784700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // professor_invites
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

    // professor_requests
    await queryRunner.query(`
      CREATE TABLE "professor_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "message" text NOT NULL DEFAULT '',
        "reviewed_by_id" uuid,
        "reviewed_at" TIMESTAMP WITH TIME ZONE,
        "decision_reason" text NOT NULL DEFAULT '',
        CONSTRAINT "PK_professor_requests" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_prof_request_user" ON "professor_requests" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_prof_request_status" ON "professor_requests" ("status")`,
    );
    // At most one PENDING request per user (backstops the service-level check).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_prof_request_pending" ON "professor_requests" ("user_id") WHERE "status" = 'pending'`,
    );
    await queryRunner.query(
      `ALTER TABLE "professor_requests" ADD CONSTRAINT "FK_prof_request_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "professor_requests" ADD CONSTRAINT "FK_prof_request_reviewed_by" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "professor_requests" DROP CONSTRAINT "FK_prof_request_reviewed_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "professor_requests" DROP CONSTRAINT "FK_prof_request_user"`,
    );
    await queryRunner.query(`DROP INDEX "uq_prof_request_pending"`);
    await queryRunner.query(`DROP INDEX "idx_prof_request_status"`);
    await queryRunner.query(`DROP INDEX "idx_prof_request_user"`);
    await queryRunner.query(`DROP TABLE "professor_requests"`);

    await queryRunner.query(
      `ALTER TABLE "professor_invites" DROP CONSTRAINT "FK_prof_invite_consumed_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "professor_invites" DROP CONSTRAINT "FK_prof_invite_invited_by"`,
    );
    await queryRunner.query(`DROP INDEX "idx_prof_invite_invited_by"`);
    await queryRunner.query(`DROP INDEX "idx_prof_invite_status"`);
    await queryRunner.query(`DROP INDEX "idx_prof_invite_token"`);
    await queryRunner.query(`DROP TABLE "professor_invites"`);
  }
}
