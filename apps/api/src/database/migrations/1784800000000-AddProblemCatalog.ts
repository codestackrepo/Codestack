import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Problem catalog additions:
 *  - companies table + problem_companies M2M join (a catalog facet alongside
 *    topic tags), mirroring the problem_tags shape.
 *  - structured fields on problems: function_name (varchar) + io_spec (jsonb),
 *    which let drivers + testcase I/O be synthesized deterministically
 *    (code-execution/driver-synth). Both nullable so legacy problems are valid.
 */
export class AddProblemCatalog1784800000000 implements MigrationInterface {
  name = 'AddProblemCatalog1784800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "companies" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" character varying(80) NOT NULL,
        CONSTRAINT "PK_companies" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_company_name" ON "companies" ("name")`,
    );

    await queryRunner.query(`
      CREATE TABLE "problem_companies" (
        "problem_id" uuid NOT NULL,
        "company_id" uuid NOT NULL,
        CONSTRAINT "PK_problem_companies" PRIMARY KEY ("problem_id", "company_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_problem_companies_problem" ON "problem_companies" ("problem_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_problem_companies_company" ON "problem_companies" ("company_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "problem_companies" ADD CONSTRAINT "FK_problem_companies_problem" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "problem_companies" ADD CONSTRAINT "FK_problem_companies_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );

    await queryRunner.query(
      `ALTER TABLE "problems" ADD COLUMN "function_name" character varying(64)`,
    );
    await queryRunner.query(`ALTER TABLE "problems" ADD COLUMN "io_spec" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "problems" DROP COLUMN "io_spec"`);
    await queryRunner.query(`ALTER TABLE "problems" DROP COLUMN "function_name"`);
    await queryRunner.query(
      `ALTER TABLE "problem_companies" DROP CONSTRAINT "FK_problem_companies_company"`,
    );
    await queryRunner.query(
      `ALTER TABLE "problem_companies" DROP CONSTRAINT "FK_problem_companies_problem"`,
    );
    await queryRunner.query(`DROP TABLE "problem_companies"`);
    await queryRunner.query(`DROP INDEX "idx_company_name"`);
    await queryRunner.query(`DROP TABLE "companies"`);
  }
}
