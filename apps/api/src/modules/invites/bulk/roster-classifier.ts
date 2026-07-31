import { Role } from '../../../common/enums/role.enum';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import {
  ClassifiedRosterRow,
  ParsedRosterRow,
  RosterAction,
  RosterConflicts,
  RosterReason,
  RosterSummary,
} from './roster.types';

/**
 * The one message every opaque outcome shares.
 *
 * Deliberately says nothing about WHY. "in another organization", "is a
 * professor" and "is the platform operator" are three different facts an org
 * admin is not entitled to learn, and a 2000-row upload that discriminated them
 * would be a platform-wide account-state enumeration oracle — 2000 probes per
 * request, rate-limited as one.
 */
const NOT_AVAILABLE_MESSAGE =
  'This address cannot be added to your organization. Contact your platform administrator if you think that is wrong.';

/**
 * Classifies parsed rows against existing state. PURE — no I/O, no clock, no
 * randomness — so preview and the commit's re-validation call the identical
 * function and cannot drift. Two implementations of this table would differ
 * eventually, and the difference would be a commit doing something the admin
 * never previewed.
 *
 * `conflicts` must already be scoped to what `actor` may see; this function does
 * not re-check tenancy, it only decides outcomes.
 */
export function classifyRoster(
  rows: ParsedRosterRow[],
  conflicts: RosterConflicts,
  actor: AuthenticatedUser,
): ClassifiedRosterRow[] {
  const isSuperAdmin = actor.role === Role.SUPERADMIN;
  const actorOrgId = actor.organizationId;
  const seenInFile = new Set<string>();

  return rows.map((row) => {
    const email = row.email.toLowerCase();
    const base = {
      rowNumber: row.rowNumber,
      email,
      firstName: row.firstName,
      lastName: row.lastName,
    };

    // First occurrence wins. Deduping to the LAST would silently prefer whichever
    // row the admin happened to paste second.
    if (seenInFile.has(email)) {
      return {
        ...base,
        action: RosterAction.SKIP,
        reason: RosterReason.DUPLICATE_IN_FILE,
        message: 'This address appears earlier in the file.',
      };
    }
    seenInFile.add(email);

    // A pending invite in THIS org already holds a seat, so re-inserting would
    // trip uq_org_invites_org_pending_email and charge twice for one person.
    if (conflicts.pendingInThisOrg.has(email)) {
      return {
        ...base,
        action: RosterAction.SKIP,
        reason: RosterReason.INVITE_ALREADY_PENDING,
        message: 'This person already has a pending invitation.',
      };
    }

    const existing = conflicts.usersByEmail.get(email);
    if (!existing) {
      // No account anywhere the actor can see. Note a pending invite in ANOTHER
      // org lands here too, as a clean invite — deliberately not surfaced, since
      // "someone else is recruiting them" is not this tenant's business.
      return { ...base, action: RosterAction.INVITE };
    }

    if (existing.organizationId === actorOrgId && actorOrgId !== null) {
      return existing.isActive
        ? {
            ...base,
            action: RosterAction.SKIP,
            reason: RosterReason.ALREADY_MEMBER,
            message: 'Already a member of your organization.',
          }
        : {
            // Never auto-reactivate. Re-enabling an account someone deliberately
            // disabled must be an explicit, individual decision — not a side
            // effect of pasting a roster.
            ...base,
            action: RosterAction.SKIP,
            reason: RosterReason.ALREADY_MEMBER_INACTIVE,
            message: 'This member’s access is turned off. Restore it from the People list.',
          };
    }

    // An unassigned student: invite them to CLAIM. Never `UPDATE users SET
    // organization_id` — absorbing an existing account because its address
    // appeared in someone's spreadsheet is the same re-homing shape 898a05f
    // closed on the identity-provider side. They click, or nothing happens.
    if (existing.organizationId === null && existing.role === Role.STUDENT) {
      if (!existing.isActive) {
        return {
          ...base,
          action: RosterAction.SKIP,
          reason: RosterReason.ACCOUNT_DISABLED,
          message: 'This account is disabled and cannot join.',
        };
      }
      return { ...base, action: RosterAction.CLAIM };
    }

    // Everything else: another tenant's member, org-less staff, or a SUPERADMIN.
    // ONE code and ONE message for an org actor. A SuperAdmin, who may already
    // read every tenant, gets the detail.
    return {
      ...base,
      action: RosterAction.ERROR,
      reason: RosterReason.NOT_AVAILABLE,
      message: isSuperAdmin ? superAdminDetail(existing) : NOT_AVAILABLE_MESSAGE,
    };
  });
}

function superAdminDetail(existing: { role: string; organizationId: string | null }): string {
  if (existing.role === Role.SUPERADMIN) return 'This is a platform administrator account.';
  if (existing.organizationId === null) return `Org-less ${existing.role} account (orphaned).`;
  return `Already belongs to organization ${existing.organizationId}.`;
}

/** Folds classified rows into the counts the preview dialog renders. */
export function summarize(rows: ClassifiedRosterRow[], parseErrors: number): RosterSummary {
  const count = (action: RosterAction): number => rows.filter((r) => r.action === action).length;

  const willInvite = count(RosterAction.INVITE);
  const willClaim = count(RosterAction.CLAIM);

  return {
    total: rows.length + parseErrors,
    willInvite,
    willClaim,
    willSkip: count(RosterAction.SKIP),
    errors: count(RosterAction.ERROR) + parseErrors,
    // A claim consumes a seat exactly like an invite: the claimer was charged to
    // nobody while org-less, so joining is a genuine +1.
    seatsRequired: willInvite + willClaim,
  };
}
