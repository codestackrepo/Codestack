import { Role } from '../../../common/enums/role.enum';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { classifyRoster, summarize } from './roster-classifier';
import {
  ConflictUser,
  ParsedRosterRow,
  RosterAction,
  RosterConflicts,
  RosterReason,
} from './roster.types';

const ORG = 'org-A';
const OTHER = 'org-B';

const actor = (over: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  id: 'admin-1',
  email: 'admin@x.dev',
  role: Role.ADMIN,
  organizationId: ORG,
  ...over,
});

const row = (email: string, rowNumber = 2): ParsedRosterRow => ({
  rowNumber,
  email,
  firstName: 'A',
  lastName: 'B',
});

const conflicts = (
  users: Record<string, Partial<ConflictUser>> = {},
  pending: string[] = [],
): RosterConflicts => ({
  usersByEmail: new Map(
    Object.entries(users).map(([email, u]) => [
      email,
      { id: 'u', role: Role.STUDENT, organizationId: ORG, isActive: true, ...u },
    ]),
  ),
  pendingInThisOrg: new Set(pending),
});

const classify = (
  rows: ParsedRosterRow[],
  c: RosterConflicts = conflicts(),
  a: AuthenticatedUser = actor(),
) => classifyRoster(rows, c, a);

describe('classifyRoster', () => {
  it('invites an address nobody has', () => {
    expect(classify([row('new@x.dev')])[0].action).toBe(RosterAction.INVITE);
  });

  // FIRST wins. Deduping to the last would silently prefer whichever row the
  // admin happened to paste second.
  it('keeps the first of a duplicate pair and skips the rest', () => {
    const out = classify([row('a@x.dev', 2), row('a@x.dev', 3), row('a@x.dev', 4)]);
    expect(out[0].action).toBe(RosterAction.INVITE);
    expect(out[1]).toMatchObject({
      action: RosterAction.SKIP,
      reason: RosterReason.DUPLICATE_IN_FILE,
    });
    expect(out[2].reason).toBe(RosterReason.DUPLICATE_IN_FILE);
  });

  it('treats case differences as the same address', () => {
    const out = classify([row('Ada@X.dev', 2), row('ada@x.dev', 3)]);
    expect(out[1].reason).toBe(RosterReason.DUPLICATE_IN_FILE);
  });

  it('skips an active member of this org', () => {
    const out = classify([row('m@x.dev')], conflicts({ 'm@x.dev': { organizationId: ORG } }));
    expect(out[0]).toMatchObject({
      action: RosterAction.SKIP,
      reason: RosterReason.ALREADY_MEMBER,
    });
  });

  // Re-enabling an account someone deliberately disabled must be an explicit,
  // individual decision — never a side effect of pasting a roster.
  it('NEVER auto-reactivates an inactive member', () => {
    const out = classify(
      [row('m@x.dev')],
      conflicts({ 'm@x.dev': { organizationId: ORG, isActive: false } }),
    );
    expect(out[0]).toMatchObject({
      action: RosterAction.SKIP,
      reason: RosterReason.ALREADY_MEMBER_INACTIVE,
    });
  });

  it('skips an address that already has a pending invite here', () => {
    const out = classify([row('p@x.dev')], conflicts({}, ['p@x.dev']));
    expect(out[0]).toMatchObject({
      action: RosterAction.SKIP,
      reason: RosterReason.INVITE_ALREADY_PENDING,
    });
  });

  // A CLAIM invite, never an UPDATE. Absorbing an existing account because its
  // address appeared in someone's spreadsheet is the re-homing shape 898a05f
  // closed on the identity-provider side.
  it('offers an unassigned active student a CLAIM, not a silent move', () => {
    const out = classify(
      [row('u@x.dev')],
      conflicts({ 'u@x.dev': { organizationId: null, role: Role.STUDENT } }),
    );
    expect(out[0].action).toBe(RosterAction.CLAIM);
  });

  it('skips an unassigned but disabled student', () => {
    const out = classify(
      [row('u@x.dev')],
      conflicts({ 'u@x.dev': { organizationId: null, role: Role.STUDENT, isActive: false } }),
    );
    expect(out[0]).toMatchObject({
      action: RosterAction.SKIP,
      reason: RosterReason.ACCOUNT_DISABLED,
    });
  });

  describe('the opaque collapse', () => {
    const cases: [string, Partial<ConflictUser>][] = [
      ['a member of another tenant', { organizationId: OTHER }],
      ['org-less staff', { organizationId: null, role: Role.PROFESSOR }],
      ['an org-less admin', { organizationId: null, role: Role.ADMIN }],
      ['the platform SuperAdmin', { organizationId: null, role: Role.SUPERADMIN }],
      ['a superadmin carrying an org', { organizationId: OTHER, role: Role.SUPERADMIN }],
    ];

    // ONE code and ONE message. Discriminating them turns a 2000-row upload into
    // a platform-wide account-state enumeration oracle — 2000 probes per request,
    // rate-limited as one.
    it.each(cases)('reports %s as an indistinguishable not_available', (_label, user) => {
      const out = classify([row('x@x.dev')], conflicts({ 'x@x.dev': user }));
      expect(out[0]).toMatchObject({
        action: RosterAction.ERROR,
        reason: RosterReason.NOT_AVAILABLE,
      });
    });

    it('gives every one of them the byte-identical message', () => {
      const messages = new Set(
        cases.map(
          ([, user]) => classify([row('x@x.dev')], conflicts({ 'x@x.dev': user }))[0].message,
        ),
      );
      expect(messages.size).toBe(1);
    });

    it('never leaks the other organization id to an org actor', () => {
      const out = classify([row('x@x.dev')], conflicts({ 'x@x.dev': { organizationId: OTHER } }));
      expect(JSON.stringify(out[0])).not.toContain(OTHER);
    });

    // A SuperAdmin may already read every tenant, so withholding it buys nothing
    // and costs them the ability to diagnose.
    it('DOES discriminate for a SuperAdmin actor', () => {
      const sa = actor({ role: Role.SUPERADMIN, organizationId: null });
      const messages = cases.map(
        ([, user]) => classify([row('x@x.dev')], conflicts({ 'x@x.dev': user }), sa)[0].message,
      );
      expect(new Set(messages).size).toBeGreaterThan(1);
    });
  });

  // "Another tenant is recruiting them" is not this tenant's business, and
  // surfacing it would leak that tenant's activity.
  it('treats a pending invite in ANOTHER org as a clean invite, unremarked', () => {
    const out = classify([row('p@x.dev')], conflicts()); // pendingInThisOrg is scoped to ORG
    expect(out[0].action).toBe(RosterAction.INVITE);
    expect(out[0].reason).toBeUndefined();
  });
});

describe('summarize', () => {
  it('counts a claim as a seat, exactly like an invite', () => {
    const rows = classify(
      [row('new@x.dev', 2), row('claim@x.dev', 3), row('member@x.dev', 4)],
      conflicts({
        'claim@x.dev': { organizationId: null, role: Role.STUDENT },
        'member@x.dev': { organizationId: ORG },
      }),
    );
    expect(summarize(rows, 0)).toMatchObject({
      willInvite: 1,
      willClaim: 1,
      willSkip: 1,
      seatsRequired: 2,
    });
  });

  it('folds parse errors into total and errors', () => {
    const rows = classify([row('a@x.dev')]);
    expect(summarize(rows, 3)).toMatchObject({ total: 4, errors: 3 });
  });

  // "Everyone in this file is already a member" is a valid outcome, not a 400.
  it('reports seatsRequired 0 for a file that is entirely skips', () => {
    const rows = classify(
      [row('m1@x.dev', 2), row('m2@x.dev', 3)],
      conflicts({ 'm1@x.dev': {}, 'm2@x.dev': {} }),
    );
    expect(summarize(rows, 0)).toMatchObject({ willInvite: 0, willClaim: 0, seatsRequired: 0 });
  });
});
