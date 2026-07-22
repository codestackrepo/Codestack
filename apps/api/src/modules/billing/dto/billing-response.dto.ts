import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Invoice } from '../entities/invoice.entity';
import { Plan } from '../entities/plan.entity';
import { Subscription } from '../entities/subscription.entity';
import { InvoiceStatus, PlanInterval, SubscriptionStatus } from '../enums/billing.enums';

export class PlanResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: PlanInterval }) interval!: PlanInterval;
  @ApiProperty() priceMinorUnits!: number;
  @ApiProperty() currency!: string;
  @ApiProperty() features!: Record<string, boolean>;

  static from(plan: Plan): PlanResponseDto {
    return {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      interval: plan.interval,
      priceMinorUnits: plan.priceMinorUnits,
      currency: plan.currency,
      features: plan.features,
    };
  }
}

export class SubscriptionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: SubscriptionStatus }) status!: SubscriptionStatus;
  @ApiPropertyOptional({ nullable: true }) planCode!: string | null;
  @ApiProperty() currentPeriodStart!: Date;
  @ApiProperty() currentPeriodEnd!: Date;
  @ApiProperty() cancelAtPeriodEnd!: boolean;

  static from(sub: Subscription): SubscriptionResponseDto {
    return {
      id: sub.id,
      status: sub.status,
      planCode: sub.plan?.code ?? null,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    };
  }
}

export class CheckoutResponseDto {
  @ApiProperty() url!: string;
}

export class InvoiceResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: InvoiceStatus }) status!: InvoiceStatus;
  @ApiProperty() amountPaid!: number;
  @ApiProperty() currency!: string;
  @ApiProperty() periodStart!: Date;
  @ApiProperty() periodEnd!: Date;
  @ApiPropertyOptional({ nullable: true }) hostedInvoiceUrl!: string | null;

  static from(invoice: Invoice): InvoiceResponseDto {
    return {
      id: invoice.id,
      status: invoice.status,
      amountPaid: invoice.amountPaid,
      currency: invoice.currency,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      hostedInvoiceUrl: invoice.hostedInvoiceUrl,
    };
  }
}
