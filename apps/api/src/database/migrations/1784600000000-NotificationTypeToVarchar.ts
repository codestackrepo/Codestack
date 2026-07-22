import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Convert notifications.type from a PG enum to varchar so new notification
 * types (submission_received, feedback_received, and any future ones) are
 * code-only additions — no ALTER TYPE migration required. Guarded so it is a
 * no-op if the enum was never created.
 */
export class NotificationTypeToVarchar1784600000000 implements MigrationInterface {
  name = 'NotificationTypeToVarchar1784600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notifications_type_enum') THEN
          ALTER TABLE "notifications" ALTER COLUMN "type" TYPE character varying(50) USING "type"::text;
          DROP TYPE "notifications_type_enum";
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."notifications_type_enum" AS ENUM('new_assignment', 'assignment_updated', 'grades_published', 'submission_received', 'feedback_received')`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "public"."notifications_type_enum" USING "type"::"public"."notifications_type_enum"`,
    );
  }
}
