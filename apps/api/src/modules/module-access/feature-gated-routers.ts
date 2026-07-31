/**
 * Controllers whose routes MUST carry an explicit `@RequiresFeature` (§9.11).
 *
 * FeatureGuard's default for an un-annotated route is ALLOW — it has to be, or
 * every existing route in the app would 403 the moment the guard is wired. That
 * default is wrong for the routers where a missed annotation is a real
 * entitlement hole (authoring, publishing, platform), so those opt into
 * DENY-by-default: a route under one of these controller paths with no
 * `@RequiresFeature` is rejected, loudly, instead of silently ungated.
 *
 * Matched against the controller's declared path (`@Controller('problems')`), not
 * the request URL, so it is independent of the global API prefix and of any
 * version segment.
 *
 * A prefix listed here before its routes are annotated turns a working endpoint
 * into a 403, so a prefix and the annotations it covers must land together —
 * never the prefix first.
 *
 * STILL EMPTY AFTER #65, and that is a finding rather than an omission.
 *
 * #65 annotated every authoring route on `problems` and `assignments`. Neither
 * prefix can be added here, because both controller paths ALSO host routes that
 * students must reach, and deny-by-default would 403 them:
 *
 *   problems     GET /, /facets, /:id, /:id/editor, /:id/test-cases
 *   assignments  GET /:id/take, POST /:id/attempt/start, /:id/attempt/submit,
 *                PUT items/:itemId/mcq|quiz   <- AssignmentItemsController shares
 *                                                the 'assignments' path
 *
 * There is no feature key those routes could carry. Every existing key is an
 * authoring or publishing capability with a `[ADMIN, PROFESSOR]` ceiling
 * (`FEATURE_ROLE_CEILING`), so annotating a student route with any of them makes
 * it a hard false for exactly the role that needs it.
 *
 * Enabling deny-by-default therefore needs one of:
 *   - consumption-side keys (`problems.view`, `assignments.take`) with ceilings
 *     that include STUDENT — a real extension of the entitlement model, with
 *     matrix defaults, not a one-line addition; or
 *   - a per-route opt-out marker, so a controller can be fail-closed by default
 *     with named exceptions.
 *
 * Until then the explicit annotations are the enforcement, and this list stays
 * empty rather than being populated with a prefix that breaks the student surface.
 */
export const FEATURE_GATED_ROUTER_PATHS: string[] = [];

/** True when `controllerPath` opts into deny-on-missing-metadata. */
export function isFeatureGatedRouter(controllerPath: string | undefined): boolean {
  if (!controllerPath) return false;
  const normalized = controllerPath.replace(/^\/+|\/+$/g, '');
  return FEATURE_GATED_ROUTER_PATHS.some((p) => normalized === p || normalized.startsWith(`${p}/`));
}
