/**
 * How an account came into existence (#118).
 *
 * PROVENANCE, not current state. Written once at creation and never updated —
 * which is the whole point, and the reason it is a separate concept from the
 * organization the user currently belongs to.
 *
 * The two questions this separation answers, which one field could not:
 *
 *   "How did this person get here?"     -> `origin`, permanently.
 *   "What ecosystem are they in NOW?"   -> their organization, which can change.
 *
 * An open-platform student who later accepts a university invite keeps
 * `origin = OPEN` while rendering as a full member of that university. Erasing
 * their provenance on the way in would destroy the only record of how they arrived,
 * which is exactly the thing support and analytics need later. Conversely, deriving
 * the ecosystem from `origin` would freeze them out of the tenant they legitimately
 * joined.
 *
 * Stored as varchar + CHECK rather than a PG enum, matching `users.role`,
 * `organizations.type` and `notifications.type` — adding a value is a CHECK
 * widening, never an ALTER TYPE.
 */
export enum UserOrigin {
  /**
   * Arrived through an organization: invited by a superadmin, admin or professor, or
   * created directly by staff inside a tenant. Someone else vouched for the address.
   */
  CLOSED = 'closed',

  /**
   * Signed themselves up on the public platform. Nobody vouched for the address,
   * which is precisely why the verification flow exists.
   */
  OPEN = 'open',
}
