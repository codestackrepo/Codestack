import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitProblems1784388980702 implements MigrationInterface {
  name = 'InitProblems1784388980702';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."library_problem_templates_language_enum" AS ENUM('python', 'javascript', 'java', 'cpp')`,
    );
    await queryRunner.query(
      `CREATE TABLE "library_problem_templates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "problem_id" uuid NOT NULL, "language" "public"."library_problem_templates_language_enum" NOT NULL, "starter_code" text NOT NULL DEFAULT '', "driver_code" text NOT NULL DEFAULT '', "created_by_id" uuid, CONSTRAINT "PK_664228314c1f3339e06907dfe13" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_lib_template_problem_lang" ON "library_problem_templates" ("problem_id", "language") `,
    );
    await queryRunner.query(
      `CREATE TABLE "tags" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(64) NOT NULL, CONSTRAINT "UQ_d90243459a697eadb8ad56e9092" UNIQUE ("name"), CONSTRAINT "PK_e7dc17249a1148a1970748eda99" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_tag_name" ON "tags" ("name") `);
    await queryRunner.query(
      `CREATE TYPE "public"."test_cases_type_enum" AS ENUM('sample', 'hidden')`,
    );
    await queryRunner.query(
      `CREATE TABLE "test_cases" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "problem_id" uuid NOT NULL, "input_data" text NOT NULL, "expected_output" text NOT NULL, "type" "public"."test_cases_type_enum" NOT NULL DEFAULT 'hidden', "explanation" text NOT NULL DEFAULT '', "is_active" boolean NOT NULL DEFAULT true, "order_index" integer NOT NULL DEFAULT '0', "weight" double precision, "time_limit_ms" integer, "memory_limit_bytes" bigint, CONSTRAINT "PK_39eb2dc90c54d7a036b015f05c4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_testcase_problem_type_active" ON "test_cases" ("problem_id", "type", "is_active") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."problems_difficulty_enum" AS ENUM('easy', 'medium', 'hard')`,
    );
    await queryRunner.query(`CREATE TYPE "public"."problems_source_enum" AS ENUM('human', 'ai')`);
    await queryRunner.query(
      `CREATE TYPE "public"."problems_visibility_enum" AS ENUM('private', 'shared')`,
    );
    await queryRunner.query(
      `CREATE TABLE "problems" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "title" character varying(255) NOT NULL, "body" text NOT NULL, "difficulty" "public"."problems_difficulty_enum" NOT NULL DEFAULT 'medium', "source" "public"."problems_source_enum" NOT NULL DEFAULT 'human', "visibility" "public"."problems_visibility_enum" NOT NULL DEFAULT 'private', "generation_request_id" uuid, "created_by_id" uuid, CONSTRAINT "PK_b3994afba6ab64a42cda1ccaeff" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_problem_difficulty" ON "problems" ("difficulty") `);
    await queryRunner.query(`CREATE INDEX "idx_problem_source" ON "problems" ("source") `);
    await queryRunner.query(`CREATE INDEX "idx_problem_visibility" ON "problems" ("visibility") `);
    await queryRunner.query(
      `CREATE INDEX "idx_problem_created_by" ON "problems" ("created_by_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "user_problem_lists" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "list_name" character varying(255) NOT NULL, CONSTRAINT "uq_user_list_name" UNIQUE ("user_id", "list_name"), CONSTRAINT "PK_7358f59feffa394c49bec0b9398" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_problem_list_user" ON "user_problem_lists" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "problem_tags" ("problem_id" uuid NOT NULL, "tag_id" uuid NOT NULL, CONSTRAINT "PK_73328b25095b174fd5daab832cd" PRIMARY KEY ("problem_id", "tag_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e369a453fb95b878301184cadd" ON "problem_tags" ("problem_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_853473f54d7b1e91b236346fa1" ON "problem_tags" ("tag_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "problem_list" ("problem_id" uuid NOT NULL, "list_id" uuid NOT NULL, CONSTRAINT "PK_5c1e0de2a1f3a47593778d4ca77" PRIMARY KEY ("problem_id", "list_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_62ec3259b4202e6fba2b31c683" ON "problem_list" ("problem_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4d5c52cdac0bfca065356d1be6" ON "problem_list" ("list_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "library_problem_templates" ADD CONSTRAINT "FK_c2c44298afd07c4b0dbe3a276fc" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "library_problem_templates" ADD CONSTRAINT "FK_17f045f173d4d9e21dc808a13e4" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "test_cases" ADD CONSTRAINT "FK_b64ac4d24cd9a87eda34b2a9457" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "problems" ADD CONSTRAINT "FK_3dd1bf7b96a25dd4f33cac664ea" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_problem_lists" ADD CONSTRAINT "FK_8e11e539b848f3f3accb28d40ac" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "problem_tags" ADD CONSTRAINT "FK_e369a453fb95b878301184caddc" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "problem_tags" ADD CONSTRAINT "FK_853473f54d7b1e91b236346fa13" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "problem_list" ADD CONSTRAINT "FK_62ec3259b4202e6fba2b31c6836" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "problem_list" ADD CONSTRAINT "FK_4d5c52cdac0bfca065356d1be61" FOREIGN KEY ("list_id") REFERENCES "user_problem_lists"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "problem_list" DROP CONSTRAINT "FK_4d5c52cdac0bfca065356d1be61"`,
    );
    await queryRunner.query(
      `ALTER TABLE "problem_list" DROP CONSTRAINT "FK_62ec3259b4202e6fba2b31c6836"`,
    );
    await queryRunner.query(
      `ALTER TABLE "problem_tags" DROP CONSTRAINT "FK_853473f54d7b1e91b236346fa13"`,
    );
    await queryRunner.query(
      `ALTER TABLE "problem_tags" DROP CONSTRAINT "FK_e369a453fb95b878301184caddc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_problem_lists" DROP CONSTRAINT "FK_8e11e539b848f3f3accb28d40ac"`,
    );
    await queryRunner.query(
      `ALTER TABLE "problems" DROP CONSTRAINT "FK_3dd1bf7b96a25dd4f33cac664ea"`,
    );
    await queryRunner.query(
      `ALTER TABLE "test_cases" DROP CONSTRAINT "FK_b64ac4d24cd9a87eda34b2a9457"`,
    );
    await queryRunner.query(
      `ALTER TABLE "library_problem_templates" DROP CONSTRAINT "FK_17f045f173d4d9e21dc808a13e4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "library_problem_templates" DROP CONSTRAINT "FK_c2c44298afd07c4b0dbe3a276fc"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_4d5c52cdac0bfca065356d1be6"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_62ec3259b4202e6fba2b31c683"`);
    await queryRunner.query(`DROP TABLE "problem_list"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_853473f54d7b1e91b236346fa1"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e369a453fb95b878301184cadd"`);
    await queryRunner.query(`DROP TABLE "problem_tags"`);
    await queryRunner.query(`DROP INDEX "public"."idx_problem_list_user"`);
    await queryRunner.query(`DROP TABLE "user_problem_lists"`);
    await queryRunner.query(`DROP INDEX "public"."idx_problem_created_by"`);
    await queryRunner.query(`DROP INDEX "public"."idx_problem_visibility"`);
    await queryRunner.query(`DROP INDEX "public"."idx_problem_source"`);
    await queryRunner.query(`DROP INDEX "public"."idx_problem_difficulty"`);
    await queryRunner.query(`DROP TABLE "problems"`);
    await queryRunner.query(`DROP TYPE "public"."problems_visibility_enum"`);
    await queryRunner.query(`DROP TYPE "public"."problems_source_enum"`);
    await queryRunner.query(`DROP TYPE "public"."problems_difficulty_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_testcase_problem_type_active"`);
    await queryRunner.query(`DROP TABLE "test_cases"`);
    await queryRunner.query(`DROP TYPE "public"."test_cases_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_tag_name"`);
    await queryRunner.query(`DROP TABLE "tags"`);
    await queryRunner.query(`DROP INDEX "public"."idx_lib_template_problem_lang"`);
    await queryRunner.query(`DROP TABLE "library_problem_templates"`);
    await queryRunner.query(`DROP TYPE "public"."library_problem_templates_language_enum"`);
  }
}
