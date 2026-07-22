import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBillingTables1784431044465 implements MigrationInterface {
  name = 'AddBillingTables1784431044465';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."webhook_events_status_enum" AS ENUM('received', 'processed', 'failed', 'ignored')`,
    );
    await queryRunner.query(
      `CREATE TABLE "webhook_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "provider" character varying(20) NOT NULL, "event_id" character varying(255) NOT NULL, "type" character varying(100) NOT NULL, "payload" jsonb NOT NULL, "status" "public"."webhook_events_status_enum" NOT NULL DEFAULT 'received', "processed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_4cba37e6a0acb5e1fc49c34ebfd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_webhook_event_type" ON "webhook_events" ("type") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_webhook_event_provider_event" ON "webhook_events" ("provider", "event_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."plans_interval_enum" AS ENUM('month', 'quarter', 'year')`,
    );
    await queryRunner.query(
      `CREATE TABLE "plans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "code" character varying(50) NOT NULL, "name" character varying(100) NOT NULL, "interval" "public"."plans_interval_enum" NOT NULL, "price_minor_units" integer NOT NULL, "currency" character varying(3) NOT NULL DEFAULT 'usd', "stripe_price_id" character varying(255) NOT NULL, "features" jsonb NOT NULL DEFAULT '{}', "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_3720521a81c7c24fe9b7202ba61" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_plan_code" ON "plans" ("code") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_plan_stripe_price" ON "plans" ("stripe_price_id") `,
    );
    await queryRunner.query(`CREATE INDEX "idx_plan_active" ON "plans" ("active") `);
    await queryRunner.query(
      `CREATE TYPE "public"."subscriptions_status_enum" AS ENUM('incomplete', 'trialing', 'active', 'past_due', 'canceled')`,
    );
    await queryRunner.query(
      `CREATE TABLE "subscriptions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "plan_id" uuid NOT NULL, "status" "public"."subscriptions_status_enum" NOT NULL, "provider" character varying(20) NOT NULL DEFAULT 'stripe', "provider_subscription_id" character varying(255) NOT NULL, "provider_customer_id" character varying(255) NOT NULL, "current_period_start" TIMESTAMP WITH TIME ZONE NOT NULL, "current_period_end" TIMESTAMP WITH TIME ZONE NOT NULL, "cancel_at_period_end" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_a87248d73155605cf782be9ee5e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_subscription_user" ON "subscriptions" ("user_id") `);
    await queryRunner.query(
      `CREATE INDEX "idx_subscription_status" ON "subscriptions" ("status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_subscription_provider_sub" ON "subscriptions" ("provider_subscription_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_subscription_provider_customer" ON "subscriptions" ("provider_customer_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_subscription_period_end" ON "subscriptions" ("current_period_end") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_subscription_one_active_per_user" ON "subscriptions" ("user_id") WHERE status IN ('active', 'trialing')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."invoices_status_enum" AS ENUM('paid', 'open', 'uncollectible', 'void')`,
    );
    await queryRunner.query(
      `CREATE TABLE "invoices" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "subscription_id" uuid, "provider_invoice_id" character varying(255) NOT NULL, "amount_paid" integer NOT NULL, "currency" character varying(3) NOT NULL DEFAULT 'usd', "status" "public"."invoices_status_enum" NOT NULL, "period_start" TIMESTAMP WITH TIME ZONE NOT NULL, "period_end" TIMESTAMP WITH TIME ZONE NOT NULL, "hosted_invoice_url" character varying(500), CONSTRAINT "PK_668cef7c22a427fd822cc1be3ce" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_invoice_user" ON "invoices" ("user_id") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_invoice_provider_invoice" ON "invoices" ("provider_invoice_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD CONSTRAINT "FK_d0a95ef8a28188364c546eb65c1" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD CONSTRAINT "FK_e45fca5d912c3a2fab512ac25dc" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_26daf5e433d6fb88ee32ce93637" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_5152c0aa0f851d9b95972b442e0" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP CONSTRAINT "FK_5152c0aa0f851d9b95972b442e0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP CONSTRAINT "FK_26daf5e433d6fb88ee32ce93637"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" DROP CONSTRAINT "FK_e45fca5d912c3a2fab512ac25dc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" DROP CONSTRAINT "FK_d0a95ef8a28188364c546eb65c1"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_invoice_provider_invoice"`);
    await queryRunner.query(`DROP INDEX "public"."idx_invoice_user"`);
    await queryRunner.query(`DROP TABLE "invoices"`);
    await queryRunner.query(`DROP TYPE "public"."invoices_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_subscription_one_active_per_user"`);
    await queryRunner.query(`DROP INDEX "public"."idx_subscription_period_end"`);
    await queryRunner.query(`DROP INDEX "public"."idx_subscription_provider_customer"`);
    await queryRunner.query(`DROP INDEX "public"."idx_subscription_provider_sub"`);
    await queryRunner.query(`DROP INDEX "public"."idx_subscription_status"`);
    await queryRunner.query(`DROP INDEX "public"."idx_subscription_user"`);
    await queryRunner.query(`DROP TABLE "subscriptions"`);
    await queryRunner.query(`DROP TYPE "public"."subscriptions_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_plan_active"`);
    await queryRunner.query(`DROP INDEX "public"."idx_plan_stripe_price"`);
    await queryRunner.query(`DROP INDEX "public"."idx_plan_code"`);
    await queryRunner.query(`DROP TABLE "plans"`);
    await queryRunner.query(`DROP TYPE "public"."plans_interval_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_webhook_event_provider_event"`);
    await queryRunner.query(`DROP INDEX "public"."idx_webhook_event_type"`);
    await queryRunner.query(`DROP TABLE "webhook_events"`);
    await queryRunner.query(`DROP TYPE "public"."webhook_events_status_enum"`);
  }
}
