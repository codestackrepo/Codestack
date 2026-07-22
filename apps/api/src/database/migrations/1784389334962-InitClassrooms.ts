import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitClassrooms1784389334962 implements MigrationInterface {
  name = 'InitClassrooms1784389334962';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "classrooms" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "course_id" character varying(255) NOT NULL, "title" character varying(255) NOT NULL, "description" text NOT NULL DEFAULT '', "term" character varying(50) NOT NULL DEFAULT 'Spring 2024', "start_date" TIMESTAMP WITH TIME ZONE NOT NULL, "end_date" TIMESTAMP WITH TIME ZONE NOT NULL, "total_users" integer NOT NULL DEFAULT '0', "created_by_id" uuid NOT NULL, "professor_id" uuid, CONSTRAINT "UQ_095f3e74ed049798ba312a62927" UNIQUE ("course_id"), CONSTRAINT "UQ_d4ba2e72211c9f814cb3562ffb6" UNIQUE ("title"), CONSTRAINT "PK_20b7b82896c06eda27548bd0c24" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_classroom_course_id" ON "classrooms" ("course_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_classroom_created_by" ON "classrooms" ("created_by_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_classroom_professor" ON "classrooms" ("professor_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "classroom_students" ("classroom_id" uuid NOT NULL, "user_id" uuid NOT NULL, CONSTRAINT "PK_eccb2896be0dd68a5a4e2f04d8a" PRIMARY KEY ("classroom_id", "user_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5a5c9a209121e443814e35c377" ON "classroom_students" ("classroom_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cb101f572999482f6344e979c2" ON "classroom_students" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "classroom_graders" ("classroom_id" uuid NOT NULL, "user_id" uuid NOT NULL, CONSTRAINT "PK_f175d4b6df3678b05f159ec1c83" PRIMARY KEY ("classroom_id", "user_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1ba0b467365c6bc5208d7d86c4" ON "classroom_graders" ("classroom_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5f4c87b027232c2946b42d38a5" ON "classroom_graders" ("user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "classrooms" ADD CONSTRAINT "FK_f00d2e7ddd4ac299c6f3fab8c85" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "classrooms" ADD CONSTRAINT "FK_737839ac4cfaa1b3a8bfebf01fb" FOREIGN KEY ("professor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "classroom_students" ADD CONSTRAINT "FK_5a5c9a209121e443814e35c3778" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "classroom_students" ADD CONSTRAINT "FK_cb101f572999482f6344e979c2e" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "classroom_graders" ADD CONSTRAINT "FK_1ba0b467365c6bc5208d7d86c44" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "classroom_graders" ADD CONSTRAINT "FK_5f4c87b027232c2946b42d38a51" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "classroom_graders" DROP CONSTRAINT "FK_5f4c87b027232c2946b42d38a51"`,
    );
    await queryRunner.query(
      `ALTER TABLE "classroom_graders" DROP CONSTRAINT "FK_1ba0b467365c6bc5208d7d86c44"`,
    );
    await queryRunner.query(
      `ALTER TABLE "classroom_students" DROP CONSTRAINT "FK_cb101f572999482f6344e979c2e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "classroom_students" DROP CONSTRAINT "FK_5a5c9a209121e443814e35c3778"`,
    );
    await queryRunner.query(
      `ALTER TABLE "classrooms" DROP CONSTRAINT "FK_737839ac4cfaa1b3a8bfebf01fb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "classrooms" DROP CONSTRAINT "FK_f00d2e7ddd4ac299c6f3fab8c85"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_5f4c87b027232c2946b42d38a5"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1ba0b467365c6bc5208d7d86c4"`);
    await queryRunner.query(`DROP TABLE "classroom_graders"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_cb101f572999482f6344e979c2"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5a5c9a209121e443814e35c377"`);
    await queryRunner.query(`DROP TABLE "classroom_students"`);
    await queryRunner.query(`DROP INDEX "public"."idx_classroom_professor"`);
    await queryRunner.query(`DROP INDEX "public"."idx_classroom_created_by"`);
    await queryRunner.query(`DROP INDEX "public"."idx_classroom_course_id"`);
    await queryRunner.query(`DROP TABLE "classrooms"`);
  }
}
