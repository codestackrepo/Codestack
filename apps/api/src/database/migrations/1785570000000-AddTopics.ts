import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #76 (canonical migration #10) — `topics` + `topic_comments`.
 *
 * Discussion threads. A topic is either GLOBAL (`topics.organization_id IS NULL`,
 * authored by a SuperAdmin, visible to every tenant) or ORG-OWNED (visible to one
 * tenant), which is the same two-scope shape `problems` already uses.
 *
 * THE LOAD-BEARING DECISION: `topic_comments.organization_id` is the COMMENT
 * AUTHOR's org, and it is NOT NULL even when the topic is global.
 *
 * That column is what org-partitions a global topic. Without it, one shared thread
 * would be a cross-tenant channel: every student in every organization reading and
 * replying to each other under a platform-authored title, which is precisely the
 * isolation the rest of the schema exists to maintain. With it, a global topic
 * behaves as one thread per organization that happens to share a title and
 * description — `scopeToOrg` on the comment's own org does all the work, and there
 * is no branch on topic scope anywhere in the read path.
 *
 * An org-less author cannot occur: `TenantContextGuard` 403s an org-less
 * non-superadmin on every topics route.
 *
 * `parent_id` is a self-FK for replies. `chk_topic_comment_not_self` stops a row
 * parenting itself; deeper cycles are not expressible through the API (a reply's
 * parent is validated to be a top-level comment in the same topic and the same org
 * partition) and are not defended against here.
 *
 * `resolved_at` is only meaningful where `is_question` — a question is what staff
 * mark answered. `chk_topic_comment_resolved` enforces that a non-question can
 * never carry a resolution, so the doubts view cannot show rows that were never
 * questions. Deliberately NOT the inverse: an unanswered question is the normal
 * state.
 *
 * NOTE — `down()` is symmetric and drops both tables with their indexes. Every
 * topic and every comment is destroyed and none of it is reconstructible from
 * another table. Correct for rolling back a feature with no other storage; not a
 * safe operation on a database carrying real discussion.
 */
export class AddTopics1785570000000 implements MigrationInterface {
  name = 'AddTopics1785570000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "topics" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "organization_id" uuid,
        "title" character varying(200) NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "created_by_id" uuid,
        "is_locked" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_topics" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `ALTER TABLE "topics" ADD CONSTRAINT "FK_topics_organization" ` +
        `FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE`,
    );
    // SET NULL on a NULLABLE column, matching `problems.created_by_id` exactly.
    //
    // An earlier draft made this NOT NULL with ON DELETE RESTRICT, which blocked
    // deleting any staff account that had ever authored a topic — the same failure
    // shape as #75's resolver CHECK, just spelled with an FK instead. Nothing else
    // in this schema uses RESTRICT: authored content either CASCADEs (assignments,
    // classrooms) or keeps the row and drops attribution (problems,
    // library_problem_templates). A topic outlives its author, so it takes the
    // latter.
    await queryRunner.query(
      `ALTER TABLE "topics" ADD CONSTRAINT "FK_topics_created_by" ` +
        `FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    );

    // The list read: global topics unioned with the actor's own org, newest first.
    await queryRunner.query(
      `CREATE INDEX "idx_topics_org" ON "topics" ("organization_id", "created_at" DESC)`,
    );
    // Global topics are read by EVERY tenant, so they get their own partial index
    // rather than sharing the one above (where organization_id IS NULL is not
    // selective within it).
    await queryRunner.query(
      `CREATE INDEX "idx_topics_global" ON "topics" ("created_at" DESC) ` +
        `WHERE "organization_id" IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "topic_comments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "topic_id" uuid NOT NULL,
        "author_id" uuid NOT NULL,
        "organization_id" uuid NOT NULL,
        "body" text NOT NULL,
        "parent_id" uuid,
        "is_question" boolean NOT NULL DEFAULT false,
        "resolved_at" TIMESTAMP WITH TIME ZONE,
        "resolved_by_id" uuid,
        CONSTRAINT "PK_topic_comments" PRIMARY KEY ("id"),
        CONSTRAINT "chk_topic_comment_not_self" CHECK ("parent_id" IS NULL OR "parent_id" <> "id"),
        CONSTRAINT "chk_topic_comment_resolved"
          CHECK ("is_question" = true OR ("resolved_at" IS NULL AND "resolved_by_id" IS NULL))
      )
    `);

    await queryRunner.query(
      `ALTER TABLE "topic_comments" ADD CONSTRAINT "FK_topic_comments_topic" ` +
        `FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "topic_comments" ADD CONSTRAINT "FK_topic_comments_author" ` +
        `FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "topic_comments" ADD CONSTRAINT "FK_topic_comments_organization" ` +
        `FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE`,
    );
    // A deleted parent takes its replies with it.
    await queryRunner.query(
      `ALTER TABLE "topic_comments" ADD CONSTRAINT "FK_topic_comments_parent" ` +
        `FOREIGN KEY ("parent_id") REFERENCES "topic_comments"("id") ON DELETE CASCADE`,
    );
    // SET NULL on the resolver, and resolved_at (never nulled by an FK) is what
    // carries the resolved state — the same split #75 arrived at the hard way.
    await queryRunner.query(
      `ALTER TABLE "topic_comments" ADD CONSTRAINT "FK_topic_comments_resolver" ` +
        `FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    );

    // THE access path for a thread: one topic, one org partition, chronological.
    // Both leading columns are always bound together — reading a topic without the
    // org predicate is the cross-tenant leak this table is shaped to prevent.
    await queryRunner.query(
      `CREATE INDEX "idx_topic_comments_thread" ON "topic_comments" ` +
        `("topic_id", "organization_id", "created_at")`,
    );
    // The staff doubts view: unanswered questions in one org.
    await queryRunner.query(
      `CREATE INDEX "idx_topic_comments_open_questions" ON "topic_comments" ` +
        `("organization_id", "created_at" DESC) WHERE "is_question" = true AND "resolved_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_topic_comments_parent" ON "topic_comments" ("parent_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_topic_comments_parent"`);
    await queryRunner.query(`DROP INDEX "public"."idx_topic_comments_open_questions"`);
    await queryRunner.query(`DROP INDEX "public"."idx_topic_comments_thread"`);
    await queryRunner.query(`DROP TABLE "topic_comments"`);
    await queryRunner.query(`DROP INDEX "public"."idx_topics_global"`);
    await queryRunner.query(`DROP INDEX "public"."idx_topics_org"`);
    await queryRunner.query(`DROP TABLE "topics"`);
  }
}
