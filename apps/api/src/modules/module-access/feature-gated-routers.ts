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
 * INTENTIONALLY EMPTY in #64. #64 ships and tests the mechanism; #65 annotates the
 * feature controllers. A prefix listed here before its routes are annotated turns
 * a working endpoint into a 403, so the two must land together — add the prefix in
 * the SAME change as the annotations it covers, never ahead of them.
 */
export const FEATURE_GATED_ROUTER_PATHS: string[] = [];

/** True when `controllerPath` opts into deny-on-missing-metadata. */
export function isFeatureGatedRouter(controllerPath: string | undefined): boolean {
  if (!controllerPath) return false;
  const normalized = controllerPath.replace(/^\/+|\/+$/g, '');
  return FEATURE_GATED_ROUTER_PATHS.some((p) => normalized === p || normalized.startsWith(`${p}/`));
}
