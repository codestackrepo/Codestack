import { Role } from '../../common/enums/role.enum';
import { OrgInviteStatus } from '../invites/enums/org-invite.enums';
import { QuotaResource } from './enums/quota-resource.enum';
import {
  ACTIVE_MEMBER_HOLDS_SEAT_SQL,
  PENDING_INVITE_HOLDS_SEAT_SQL,
  pendingInviteHoldsSeatQb,
  roleForSeatResource,
  seatResourceFor,
} from './seat-predicate';

/**
 * `seatResourceFor` is consulted by every one of the seven places that create or
 * convert a seat. A wrong answer at any of them is a cap that silently does not
 * apply, which is invisible until an org is over its limit — so the mapping itself is
 * pinned here rather than left to each call site's own test.
 */
describe('seatResourceFor', () => {
  it('charges a professor to the professor cap', () => {
    expect(seatResourceFor(Role.PROFESSOR)).toBe(QuotaResource.MAX_PROFESSORS);
  });

  it('charges a student to the student cap', () => {
    expect(seatResourceFor(Role.STUDENT)).toBe(QuotaResource.MAX_STUDENTS);
  });

  /**
   * ADMIN returns null by DECISION (#118), not omission.
   *
   * Admins count against `MAX_USERS` only. Folding them into `MAX_PROFESSORS` as
   * "staff" would make the superadmin's approval form lie: a field labelled
   * "professors: 10" would silently mean professors-and-admins, so onboarding three
   * admins would cost three teaching seats. If a combined staff cap is ever wanted it
   * belongs as its own resource.
   */
  it('charges an admin to no per-role cap', () => {
    expect(seatResourceFor(Role.ADMIN)).toBeNull();
  });

  // Org-less by construction — `chk_users_org_required` forbids an org-carrying
  // superadmin, so it can never occupy a tenant's seat.
  it('charges a superadmin to no per-role cap', () => {
    expect(seatResourceFor(Role.SUPERADMIN)).toBeNull();
  });

  // Exhaustive: a new role must force a decision here rather than defaulting to
  // "uncapped", which is the failure mode that would go unnoticed.
  it('has an explicit answer for every role', () => {
    for (const role of Object.values(Role)) {
      expect(seatResourceFor(role)).not.toBeUndefined();
    }
  });

  it('round-trips with roleForSeatResource for the two per-role caps', () => {
    expect(roleForSeatResource(QuotaResource.MAX_PROFESSORS)).toBe(Role.PROFESSOR);
    expect(roleForSeatResource(QuotaResource.MAX_STUDENTS)).toBe(Role.STUDENT);
    for (const role of [Role.PROFESSOR, Role.STUDENT]) {
      const resource = seatResourceFor(role);
      expect(roleForSeatResource(resource!)).toBe(role);
    }
  });

  it('maps the non-role resources to no role', () => {
    expect(roleForSeatResource(QuotaResource.MAX_USERS)).toBeNull();
    expect(roleForSeatResource(QuotaResource.MAX_PROBLEMS)).toBeNull();
    expect(roleForSeatResource(QuotaResource.MAX_ASSIGNMENTS)).toBeNull();
  });
});

/**
 * The two renderings of one rule.
 *
 * They cannot be a single string — raw SQL needs column names and the QueryBuilder
 * needs entity property names — so what is asserted is that both express the same
 * two conditions. A divergence here is the nasty quiet kind: the platform console
 * would report an org has room while enforcement 409s it, or the reverse.
 */
describe('the seat predicate renderings agree', () => {
  it('both require the PENDING status, taken from the enum rather than a literal', () => {
    expect(PENDING_INVITE_HOLDS_SEAT_SQL).toContain(`'${OrgInviteStatus.PENDING}'`);
    expect(pendingInviteHoldsSeatQb('i')).toContain(`'${OrgInviteStatus.PENDING}'`);
  });

  // Without this term a timed-out invite holds its seat forever: `expired` is a STORED
  // status flipped lazily, so a stale row can sit as `pending` indefinitely.
  it('both exclude an expired-but-still-pending invite', () => {
    expect(PENDING_INVITE_HOLDS_SEAT_SQL).toContain('expires_at > now()');
    expect(pendingInviteHoldsSeatQb('i')).toContain('expiresAt > now()');
  });

  it('the QueryBuilder rendering qualifies every column with the alias', () => {
    const fragment = pendingInviteHoldsSeatQb('inv');
    expect(fragment).toBe(`inv.status = '${OrgInviteStatus.PENDING}' AND inv.expiresAt > now()`);
  });

  it('only ACTIVE members hold a seat', () => {
    expect(ACTIVE_MEMBER_HOLDS_SEAT_SQL).toBe('is_active = true');
  });

  // The raw fragment is embedded directly into a WHERE clause alongside positional
  // parameters, so it must contain none of its own or the numbering would shift.
  it('the raw fragment carries no positional parameters', () => {
    expect(PENDING_INVITE_HOLDS_SEAT_SQL).not.toMatch(/\$\d/);
    expect(ACTIVE_MEMBER_HOLDS_SEAT_SQL).not.toMatch(/\$\d/);
  });
});
