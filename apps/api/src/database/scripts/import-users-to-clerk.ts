import 'reflect-metadata';
import { createClerkClient, type ClerkClient } from '@clerk/backend';
import dataSource from '../data-source';
import { Role } from '../../common/enums/role.enum';
import { Organization } from '../../modules/organizations/entities/organization.entity';
import { User } from '../../modules/users/entities/user.entity';
import {
  ImportArgs,
  ImportReport,
  clerkOrgRoleForRole,
  detectHasher,
  emptyReport,
  formatReport,
  parseArgs,
} from './import-users-to-clerk.util';

/**
 * #53 — one-off argon2 -> Clerk password import. NOT a DB migration.
 *
 * For each local user that still has a password and isn't linked to Clerk, this
 * creates the Clerk user importing the argon2 digest (so they log in with their
 * EXISTING password), adds them to their Clerk org with the mapped role, and
 * writes clerk_user_id back to the local row. Un-importable hashes create a
 * password-less Clerk user (reset/magic-link) and are listed in the report.
 *
 * The local argon2 login path + nullable password_hash stay LIVE — this script
 * only ADDS clerk_user_id. Verify sign-in for imported users in prod BEFORE the
 * gated DropLegacyPasswordAuth migration (#79).
 *
 * Idempotent + re-runnable: already-linked users are skipped; if a Clerk user
 * already exists for an email (a prior partial run or a self-signup) it is linked
 * rather than duplicated.
 *
 *   pnpm --filter @codestack/api import:clerk -- --dry-run
 *   pnpm --filter @codestack/api import:clerk -- --limit=50
 *   pnpm --filter @codestack/api import:clerk
 */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = emptyReport();

  // Dry run needs no Clerk client (it makes zero external calls).
  let clerk: ClerkClient | null = null;
  if (!args.dryRun) {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      console.error('CLERK_SECRET_KEY is not set — aborting (use --dry-run to preview offline).');
      process.exit(1);
    }
    clerk = createClerkClient({ secretKey });
  }

  await dataSource.initialize();
  const users = dataSource.getRepository(User);
  const orgs = dataSource.getRepository(Organization);

  const qb = users
    .createQueryBuilder('u')
    .addSelect('u.passwordHash') // select:false by default — needed for the digest
    .where('u.clerk_user_id IS NULL')
    .andWhere('u.password_hash IS NOT NULL')
    .orderBy('u.created_at', 'ASC');
  if (args.limit) qb.take(args.limit);
  const candidates = await qb.getMany();

  console.log(
    `${candidates.length} candidate user(s) (unlinked, password-backed)${args.dryRun ? ' — DRY RUN' : ''}.`,
  );

  const orgClerkIdCache = new Map<string, string | null>();
  const clerkOrgIdFor = async (orgId: string | null): Promise<string | null> => {
    if (!orgId) return null;
    if (!orgClerkIdCache.has(orgId)) {
      const org = await orgs.findOne({ where: { id: orgId } });
      orgClerkIdCache.set(orgId, org?.clerkOrgId ?? null);
    }
    return orgClerkIdCache.get(orgId) ?? null;
  };

  for (const u of candidates) {
    try {
      await importOne(u, {
        args,
        report,
        users,
        clerk,
        clerkOrgId: await clerkOrgIdFor(u.organizationId),
      });
    } catch (err) {
      report.errors.push({ email: u.email, error: (err as Error).message });
    }
  }

  console.log(formatReport(report, args.dryRun));
  await dataSource.destroy();
}

interface ImportDeps {
  args: ImportArgs;
  report: ImportReport;
  users: ReturnType<typeof dataSource.getRepository<User>>;
  clerk: ClerkClient | null;
  clerkOrgId: string | null;
}

async function importOne(u: User, deps: ImportDeps): Promise<void> {
  const { args, report, users, clerk, clerkOrgId } = deps;
  const hasher = detectHasher(u.passwordHash);

  // DRY RUN: classify without any external call.
  if (args.dryRun || !clerk) {
    if (hasher) report.imported++;
    else report.fallback.push(u.email);
    if (hasher && clerkOrgId === null && u.role !== Role.SUPERADMIN)
      report.skippedNoOrg.push(u.email);
    return;
  }

  // Re-runnable: link an already-existing Clerk user rather than duplicating.
  const existing = await clerk.users.getUserList({ emailAddress: [u.email] });
  let clerkUserId = existing.data[0]?.id ?? null;

  if (clerkUserId) {
    report.linkedExisting++;
  } else {
    const base = {
      emailAddress: [u.email],
      firstName: u.firstName || undefined,
      lastName: u.lastName || undefined,
      publicMetadata: {
        appUserId: u.id,
        ...(u.role === Role.SUPERADMIN ? { role: 'superadmin' } : {}),
      },
    };
    if (hasher) {
      try {
        const created = await clerk.users.createUser({
          ...base,
          passwordDigest: u.passwordHash ?? undefined,
          passwordHasher: hasher as 'argon2id' | 'argon2i' | 'bcrypt',
        });
        clerkUserId = created.id;
        report.imported++;
      } catch {
        // Clerk rejected the digest — create password-less (reset/magic-link).
        const created = await clerk.users.createUser(base);
        clerkUserId = created.id;
        report.fallback.push(u.email);
      }
    } else {
      const created = await clerk.users.createUser(base);
      clerkUserId = created.id;
      report.fallback.push(u.email);
    }
  }

  // Add to the Clerk org with the mapped role (when provisioned + not superadmin).
  const orgRole = clerkOrgRoleForRole(u.role);
  if (clerkOrgId && orgRole) {
    try {
      await clerk.organizations.createOrganizationMembership({
        organizationId: clerkOrgId,
        userId: clerkUserId,
        role: orgRole,
      });
    } catch {
      // Already a member (re-run) — the local link below is still authoritative.
    }
  } else if (orgRole && !clerkOrgId) {
    report.skippedNoOrg.push(u.email);
  }

  // Link back (keeps the argon2 path live — only adds clerk_user_id).
  await users.update({ id: u.id }, { clerkUserId });
}

main().catch((err) => {
  console.error('Clerk import failed:', err);
  process.exit(1);
});
