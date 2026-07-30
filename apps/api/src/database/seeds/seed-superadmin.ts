import 'reflect-metadata';
import * as argon2 from 'argon2';
import dataSource from '../data-source';
import { Role } from '../../common/enums/role.enum';
import { User } from '../../modules/users/entities/user.entity';

/**
 * #62 — SuperAdmin bootstrap. Idempotently ensures every email in
 * CODESTACK_SUPERADMIN_EMAILS is an active SUPERADMIN (role=superadmin,
 * organization_id=NULL). This is the ONLY way a SUPERADMIN comes into existence:
 * no self-registration, invite acceptance or `PATCH /users` can mint one.
 *
 * A brand-new SuperAdmin gets a password ONLY if CODESTACK_SUPERADMIN_PASSWORD is
 * set; without one the row has a NULL hash and cannot log in at all until a
 * password reset. Promoting an EXISTING user always preserves their password.
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

  const newPassword = process.env.CODESTACK_SUPERADMIN_PASSWORD;
  const newHash = newPassword ? await argon2.hash(newPassword) : null;

  for (const email of emails) {
    // Per-email isolation: one failure logs + continues to the rest.
    try {
      // addSelect is mandatory: passwordHash is `select: false` on the entity, so
      // a plain findOne leaves it undefined and every `!user.passwordHash` branch
      // below reads as "no password" — which silently RESET an existing
      // SuperAdmin's password on each re-run.
      let user = await users
        .createQueryBuilder('u')
        .addSelect('u.passwordHash')
        .where('u.email = :email', { email })
        .getOne();

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
          `created SUPERADMIN ${email}${newHash ? ' (with password)' : ' (NO password — needs a reset to sign in)'}`,
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
