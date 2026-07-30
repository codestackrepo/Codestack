import { SetMetadata } from '@nestjs/common';

export const ALLOWS_UNASSIGNED_KEY = 'allowsUnassigned';

/**
 * Lets an ORG-LESS authenticated user reach this handler.
 *
 * A self-registered student has `organization_id = NULL` until staff assign them
 * or they claim an invite, and `TenantContextGuard` 403s `no_organization` on
 * everything else. This decorator is the confinement's only escape hatch, and the
 * allowlist is meant to stay tiny and enumerable — a decorator rather than a
 * hardcoded path list so the exemption sits on the handler a reviewer is already
 * reading.
 *
 * It is NOT `@Public()`: the user is fully authenticated and `request.user` is
 * populated. It only says "having no tenant is acceptable here".
 *
 * The bar for adding one: the handler must be OWNER-SCOPED (every read and write
 * keyed on `actor.id`) or TOKEN-SCOPED (keyed on a secret the caller presents).
 * A handler behind this decorator must never call `scopeToOrg` or `assertSameOrg`
 * — there is no tenant to scope to, and `includeGlobal` would emit `col IS NULL`,
 * which matches every org-less row in the table rather than none.
 *
 * Deliberately NOT applied to `POST /onboarding/requests`: `listRequests` scopes
 * the admin queue through `scopeToOrg`, so an org-less requester's row would be
 * invisible to every admin — a silent black hole rather than an error.
 */
export const AllowsUnassigned = () => SetMetadata(ALLOWS_UNASSIGNED_KEY, true);
