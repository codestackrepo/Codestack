import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitDemo1784390961571 implements MigrationInterface {
  name = 'InitDemo1784390961571';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "demo_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "full_name" character varying(255) NOT NULL, "email" character varying(254) NOT NULL, "phone_number" character varying(30), CONSTRAINT "PK_caebe842f55969080ee55adf186" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "demo_requests"`);
  }
}
