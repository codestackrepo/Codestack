import { ConflictException } from '@nestjs/common';
import { QuotaResource } from './enums/quota-resource.enum';

export interface QuotaExceededBody {
  reason: 'quota_exceeded';
  resource: QuotaResource;
  limit: number;
  current: number;
  attempted: number;
  wouldBe: number;
}

/**
 * 409, deliberately NOT 403 (#66, §5.4). A 403 in this app means "you may not do
 * this" (`module_disabled`, `entitlement_required`) and the UI reacts by hiding or
 * redirecting. A quota breach is different in kind: the action is permitted, the
 * tenant is simply full — so it gets a conflict status and carries the NUMBERS, and
 * the UI shows an inline dialog with them instead of navigating away.
 *
 * The numbers are all four the caller needs to render a sentence without doing
 * arithmetic it could get wrong: `current` (in use now), `attempted` (this
 * request), `wouldBe` (the sum), `limit`. `wouldBe > limit` is the breach.
 *
 * AllExceptionsFilter already spreads an object body onto the response, so no
 * filter change is needed for these fields to reach the client.
 */
export class QuotaExceededException extends ConflictException {
  constructor(body: Omit<QuotaExceededBody, 'reason' | 'wouldBe'>) {
    super({
      reason: 'quota_exceeded',
      ...body,
      wouldBe: body.current + body.attempted,
    } satisfies QuotaExceededBody);
  }
}
