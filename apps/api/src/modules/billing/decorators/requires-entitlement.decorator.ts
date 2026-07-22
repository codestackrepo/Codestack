import { SetMetadata } from '@nestjs/common';
import { Entitlement } from '../enums/billing.enums';

export const ENTITLEMENT_KEY = 'requiresEntitlement';

/** Route-level marker consumed by EntitlementGuard. Only for paid-only features with no free tier. */
export const RequiresEntitlement = (entitlement: Entitlement) =>
  SetMetadata(ENTITLEMENT_KEY, entitlement);
