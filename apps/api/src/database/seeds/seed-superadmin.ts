import 'reflect-metadata';
import * as argon2 from 'argon2';
import { createClerkClient } from '@clerk/backend';
import dataSource from '../data-source';
import { Role } from '../../common/enums/role.enum';
import { User } from '../../modules/users/entities/user.entity';

/**
 * #62 — SuperAdmin bootstrap. Idempotently ensures every email in
 * CODESTACK_SUPERADMIN_EMAILS is an active SUPERADMIN (role=superadmin,
 * organization_id=NULL) locally, and — when Clerk is configured — stamps that
 * Clerk user's publicMetadata.role='superadmin' so a Clerk login is recognized
 * (the user.created webhook, #52, promotes post-boot signups the same way).
 *
 * A brand-new SuperAdmin gets a password ONLY if CODESTACK_SUPERADMIN_PASSWORD
 * is set (so cookie-mode login works); otherwise it's Clerk-managed (null hash).
 * Promoting an EXISTING user preserves their password.
 *
 *   CODESTACK_SUPERADMIN_EMAILS=a@x.dev,b@x.dev pnpm --filter @codestack/api seed:superadmin
 */
async function main(): Promise<void> {
  const emails = (process.env.CODESTACK_SUPERADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!emails.length) {
    console.log('CODESTACK_SUPERADMIN_EMAILS is empty — nothing to seed.');
    return;
  }

  await dataSource.initialize();
  const users = dataSource.getRepository(User);

  const secretKey = process.env.CLERK_SECRET_KEY;
  const clerk = secretKey ? createClerkClient({ secretKey }) : null;

  const newPassword = process.env.CODESTACK_SUPERADMIN_PASSWORD;
  const newHash = newPassword ? await argon2.hash(newPassword) : null;

  for (const email of emails) {
    // Per-email isolation: one failure logs + continues to the rest.
    try {
      let user = await users.findOne({ where: { email } });

      if (!user) {
        user = await users.save(
          users.create({
            email,
            firstName: 'Super',
            lastName: 'Admin',
            role: Role.SUPERADMIN,
            organizationId: null,
            passwordHash: newHash,
            isActive: true,
          }),
        );
        console.log(
          `created SUPERADMIN ${email}${newHash ? ' (with password)' : ' (Clerk-managed)'}`,
        );
      } else if (user.role !== Role.SUPERADMIN || user.organizationId !== null || !user.isActive) {
        user.role = Role.SUPERADMIN;
        user.organizationId = null;
        user.isActive = true;
        // Backfill a password onto a previously password-less row when one is
        // provided, so a re-run can grant cookie-mode login (existing hashes kept).
        if (newHash && !user.passwordHash) user.passwordHash = newHash;
        user = await users.save(user);
        console.log(`promoted ${email} to SUPERADMIN (existing password preserved)`);
      } else {
        if (newHash && !user.passwordHash) {
          user.passwordHash = newHash;
          user = await users.save(user);
          console.log(`${email} already SUPERADMIN — backfilled a password`);
        } else {
          console.log(`${email} already an active SUPERADMIN`);
        }
      }

      if (clerk) {
        const list = await clerk.users.getUserList({ emailAddress: [email] });
        const clerkUser = list.data[0];
        if (clerkUser) {
          await clerk.users.updateUserMetadata(clerkUser.id, {
            publicMetadata: { role: 'superadmin' },
          });
          if (!user.clerkUserId) {
            user.clerkUserId = clerkUser.id;
            await users.save(user);
          }
          console.log(`  set Clerk publicMetadata.role=superadmin for ${email}`);
        } else {
          // No Clerk account yet: the webhook only promotes if the SIGNUP itself
          // carries superadmin metadata, which it won't — re-run this seed after
          // the user signs up (or import them) to stamp the metadata.
          console.log(`  (no Clerk user for ${email} yet — re-run this seed after they sign up)`);
        }
      }
    } catch (err) {
      console.log(`  FAILED for ${email}: ${(err as Error).message}`);
    }
  }

  await dataSource.destroy();
  console.log('SuperAdmin bootstrap complete.');
}

main().catch((err) => {
  console.error('seed-superadmin failed:', err);
  process.exit(1);
});
