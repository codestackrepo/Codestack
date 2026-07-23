import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Practice-only gamification persistence (§5.6): user_gamification aggregate,
 * user_solved_problems (first-solve guard), points_ledger (exactly-once awards),
 * daily_activity (heatmap + streak source), plus the canonical users.timezone.
 * Sole owner of users.timezone + these four tables. Difficulty stored as varchar
 * (no PG enum → nothing to drop in down()). Timestamp continues the round-epoch
 * convention after 1785200000000 (module-access).
 */
export class AddGamification1785300000000 implements MigrationInterface {
  name = 'AddGamification1785300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "timezone" character varying(64) NOT NULL DEFAULT 'UTC'`,
    );

    await queryRunner.query(`
      CREATE TABLE "user_gamification" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "total_points" integer NOT NULL DEFAULT 0,
        "easy_solved" integer NOT NULL DEFAULT 0,
        "medium_solved" integer NOT NULL DEFAULT 0,
        "hard_solved" integer NOT NULL DEFAULT 0,
        "current_streak" integer NOT NULL DEFAULT 0,
        "longest_streak" integer NOT NULL DEFAULT 0,
        "last_activity_date" date,
        "timezone" character varying(64) NOT NULL DEFAULT 'UTC',
        CONSTRAINT "PK_user_gamification" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_user_gamification_user" ON "user_gamification" ("user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "user_solved_problems" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "problem_id" uuid NOT NULL,
        "difficulty" character varying(16) NOT NULL,
        "first_solved_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_solved_problems" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_user_solved_problem" ON "user_solved_problems" ("user_id", "problem_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "points_ledger" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "points" integer NOT NULL,
        "reason" character varying(64) NOT NULL,
        "ref_key" character varying(128) NOT NULL,
        CONSTRAINT "PK_points_ledger" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_points_ledger_dedupe" ON "points_ledger" ("user_id", "reason", "ref_key")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_points_ledger_user" ON "points_ledger" ("user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "daily_activity" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "activity_date" date NOT NULL,
        "submission_count" integer NOT NULL DEFAULT 0,
        "solved_count" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_daily_activity" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_daily_activity_user_date" ON "daily_activity" ("user_id", "activity_date")`,
    );

    // FKs (all CASCADE) — referenced tables (users, problems) already exist.
    await queryRunner.query(
      `ALTER TABLE "user_gamification" ADD CONSTRAINT "FK_user_gamification_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_solved_problems" ADD CONSTRAINT "FK_user_solved_problems_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_solved_problems" ADD CONSTRAINT "FK_user_solved_problems_problem" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "points_ledger" ADD CONSTRAINT "FK_points_ledger_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_activity" ADD CONSTRAINT "FK_daily_activity_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "daily_activity" DROP CONSTRAINT "FK_daily_activity_user"`,
    );
    await queryRunner.query(`ALTER TABLE "points_ledger" DROP CONSTRAINT "FK_points_ledger_user"`);
    await queryRunner.query(
      `ALTER TABLE "user_solved_problems" DROP CONSTRAINT "FK_user_solved_problems_problem"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_solved_problems" DROP CONSTRAINT "FK_user_solved_problems_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_gamification" DROP CONSTRAINT "FK_user_gamification_user"`,
    );

    await queryRunner.query(`DROP INDEX "public"."uq_daily_activity_user_date"`);
    await queryRunner.query(`DROP TABLE "daily_activity"`);
    await queryRunner.query(`DROP INDEX "public"."idx_points_ledger_user"`);
    await queryRunner.query(`DROP INDEX "public"."uq_points_ledger_dedupe"`);
    await queryRunner.query(`DROP TABLE "points_ledger"`);
    await queryRunner.query(`DROP INDEX "public"."uq_user_solved_problem"`);
    await queryRunner.query(`DROP TABLE "user_solved_problems"`);
    await queryRunner.query(`DROP INDEX "public"."uq_user_gamification_user"`);
    await queryRunner.query(`DROP TABLE "user_gamification"`);

    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "timezone"`);
  }
}
