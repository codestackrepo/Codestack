import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #75 (canonical migration #9) — `problem_feedback`.
 *
 * Students raise a doubt, an issue or a suggestion against a problem; the org's
 * staff resolve it. This is the storage for that plus the doubts inbox.
 *
 * THE LOAD-BEARING DECISION: `organization_id` is the AUTHOR's org, never the
 * problem's.
 *
 * A global problem has `problems.organization_id IS NULL` (scope='global', per
 * `chk_problem_scope_org`). If feedback inherited the problem's org, every doubt
 * about a platform problem would land in a NULL tenant — invisible to
 * `scopeToOrg`, unroutable to any staff, and readable by nobody. Anchoring to the
 * author instead means a doubt on a shared global problem reaches the STUDENT's
 * own staff, which is the only group that can actually help them, and keeps one
 * org's doubts out of another's inbox even though they concern the same problem.
 *
 * It is therefore NOT NULL. An org-less author cannot occur: `TenantContextGuard`
 * 403s an org-less non-superadmin on every problems route, so there is no path
 * that could produce one.
 *
 * `varchar` + `CHECK` for `kind` and `status`, never a native enum — house rule.
 * A future kind is then an ordinary reversible migration rather than an
 * `ALTER TYPE ADD VALUE` with no `DROP VALUE` to undo it.
 *
 * `chk_problem_feedback_resolution` keys the resolved state on `resolved_at`
 * ALONE, and deliberately does not also require `resolved_by_id IS NOT NULL` even
 * though the service always writes both. The resolver FK is `ON DELETE SET NULL`,
 * and that fires an `UPDATE` on this row, which re-evaluates the CHECK. An earlier
 * draft required the id and made deleting any staff member who had ever resolved
 * feedback fail outright:
 *
 *     ERROR:  new row for relation "problem_feedback" violates check
 *             constraint "chk_problem_feedback_resolution"
 *     CONTEXT: SQL statement "UPDATE ONLY "public"."problem_feedback"
 *              SET "resolved_by_id" = NULL WHERE ..."
 *
 * `resolved_at` is never nulled by any FK, so it stays a reliable marker of "this
 * was resolved" after the resolver's account is gone. The open arm still requires
 * BOTH to be null, so an open row can never carry stale resolution data.
 *
 * NOTE — a SQL comment inside these template literals must contain no backticks;
 * a backtick terminates the JS template literal and the file fails to parse.
 *
 * NOTE — `down()` is symmetric and drops the table with its indexes. Every piece
 * of feedback and every resolution note is destroyed; none of it is reconstructible
 * from another table. That is accepted for a rollback of a feature that has no
 * other storage, but it is not a safe operation on a database with real traffic.
 */
export class AddProblemFeedback1785560000000 implements MigrationInterface {
  name = 'AddProblemFeedback1785560000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "problem_feedback" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "problem_id" uuid NOT NULL,
        "author_id" uuid NOT NULL,
        "organization_id" uuid NOT NULL,
        "kind" character varying(20) NOT NULL,
        "body" text NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'open',
        "resolved_by_id" uuid,
        "resolved_at" TIMESTAMP WITH TIME ZONE,
        "resolution_note" text,
        CONSTRAINT "PK_problem_feedback" PRIMARY KEY ("id"),
        CONSTRAINT "chk_problem_feedback_kind"
          CHECK ("kind" IN ('doubt','issue','suggestion')),
        CONSTRAINT "chk_problem_feedback_status"
          CHECK ("status" IN ('open','resolved')),
        -- resolved_at is the state; resolved_by_id is only attribution.
        -- The resolved arm must NOT require resolved_by_id -- see the header.
        CONSTRAINT "chk_problem_feedback_resolution" CHECK (
          CASE "status"
            WHEN 'resolved' THEN "resolved_at" IS NOT NULL
            ELSE "resolved_by_id" IS NULL AND "resolved_at" IS NULL
          END
        )
      )
    `);

    // CASCADE on the problem: feedback about a deleted problem has no subject.
    await queryRunner.query(
      `ALTER TABLE "problem_feedback" ADD CONSTRAINT "FK_problem_feedback_problem" ` +
        `FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE`,
    );
    // CASCADE on the author: deleting an account removes what they wrote.
    await queryRunner.query(
      `ALTER TABLE "problem_feedback" ADD CONSTRAINT "FK_problem_feedback_author" ` +
        `FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "problem_feedback" ADD CONSTRAINT "FK_problem_feedback_organization" ` +
        `FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE`,
    );
    // SET NULL, not CASCADE: a resolver leaving the organization must not delete
    // the resolution. The row keeps `status='resolved'` and its note, so the CHECK
    // above deliberately does not require `resolved_by_id` to stay populated —
    // it is asserted at the moment of transition, and this FK can blank it later.
    await queryRunner.query(
      `ALTER TABLE "problem_feedback" ADD CONSTRAINT "FK_problem_feedback_resolver" ` +
        `FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    );

    // The doubts inbox: staff read their org's open items, newest first. Partial on
    // `status='open'` because a resolved row is never listed by that screen again,
    // and resolved rows become the overwhelming majority over time.
    await queryRunner.query(
      `CREATE INDEX "idx_problem_feedback_open_by_org" ON "problem_feedback" ` +
        `("organization_id", "created_at" DESC) WHERE "status" = 'open'`,
    );
    // The per-problem thread, which renders both open and resolved.
    await queryRunner.query(
      `CREATE INDEX "idx_problem_feedback_problem" ON "problem_feedback" ` +
        `("problem_id", "created_at" DESC)`,
    );
    // "my feedback" on the problem detail page.
    await queryRunner.query(
      `CREATE INDEX "idx_problem_feedback_author" ON "problem_feedback" ("author_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_problem_feedback_author"`);
    await queryRunner.query(`DROP INDEX "public"."idx_problem_feedback_problem"`);
    await queryRunner.query(`DROP INDEX "public"."idx_problem_feedback_open_by_org"`);
    await queryRunner.query(
      `ALTER TABLE "problem_feedback" DROP CONSTRAINT "FK_problem_feedback_resolver"`,
    );
    await queryRunner.query(
      `ALTER TABLE "problem_feedback" DROP CONSTRAINT "FK_problem_feedback_organization"`,
    );
    await queryRunner.query(
      `ALTER TABLE "problem_feedback" DROP CONSTRAINT "FK_problem_feedback_author"`,
    );
    await queryRunner.query(
      `ALTER TABLE "problem_feedback" DROP CONSTRAINT "FK_problem_feedback_problem"`,
    );
    await queryRunner.query(`DROP TABLE "problem_feedback"`);
  }
}
