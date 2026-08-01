import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../../common/enums/role.enum';
import { UserOrigin } from '../../common/enums/user-origin.enum';
import { MailService } from '../mail/mail.service';
import { MailTemplate } from '../mail/mail.types';
import { CommunityOrgService } from '../organizations/community-org.service';
import { COMMUNITY_ORG_ID } from '../organizations/organizations.constants';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';

const user = (over: Partial<User> = {}): User =>
  ({
    id: 'u-1',
    email: 'ada@x.dev',
    firstName: 'Ada',
    lastName: 'Lovelace',
    role: Role.STUDENT,
    organizationId: null,
    isActive: true,
    passwordHash: '$argon2id$existing',
    emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
    origin: UserOrigin.CLOSED,
    ...over,
  }) as User;

const REGISTER = {
  email: 'New@X.dev',
  firstName: 'Ada',
  lastName: 'Lovelace',
  password: 'Password1',
} as never;

// The real constant, not a re-typed copy: a hardcoded uuid here would keep passing on
// the day the constant changed, asserting against an id nothing else uses.
const COMMUNITY_ID = COMMUNITY_ORG_ID;

function setup(opts: { found?: User | null; passwordOk?: boolean; byEmail?: User | null } = {}) {
  const created = user({ id: 'u-new', emailVerifiedAt: null, origin: UserOrigin.OPEN });
  const users = {
    findByEmailWithPassword: jest
      .fn()
      .mockResolvedValue(opts.found === undefined ? user() : opts.found),
    findByEmail: jest.fn().mockResolvedValue(opts.byEmail ?? null),
    verifyPassword: jest.fn().mockResolvedValue(opts.passwordOk ?? true),
    updateLastLogin: jest.fn().mockResolvedValue(undefined),
    getById: jest.fn().mockResolvedValue(user()),
    hashPassword: jest.fn().mockResolvedValue('$argon2id$fresh'),
    createOpenSelfSignup: jest.fn().mockResolvedValue(created),
    create: jest.fn(),
  } as unknown as UsersService;

  const jwt = { signAsync: jest.fn().mockResolvedValue('signed') } as unknown as JwtService;
  const emailVerification = { issue: jest.fn().mockResolvedValue(undefined) };
  const community = { id: COMMUNITY_ID, isCommunity: jest.fn() };
  const mail = {
    enqueue: jest.fn().mockResolvedValue(undefined),
    webUrl: jest.fn((p: string) => `https://app.dev/${p}`),
  };
  const config = {
    getOrThrow: jest.fn().mockReturnValue({
      accessSecret: 'a'.repeat(32),
      refreshSecret: 'b'.repeat(32),
      accessTtl: '1d',
      refreshTtl: '7d',
    }),
  } as unknown as ConfigService;

  const svc = new AuthService(
    users,
    jwt,
    emailVerification as unknown as EmailVerificationService,
    community as unknown as CommunityOrgService,
    mail as unknown as MailService,
    config,
  );
  return { svc, users, emailVerification, mail, created };
}

describe('AuthService.validateCredentials', () => {
  it('returns the user when the password is right and the address is confirmed', async () => {
    const { svc } = setup();
    await expect(svc.validateCredentials('ada@x.dev', 'Password1')).resolves.toMatchObject({
      id: 'u-1',
    });
  });

  it.each([
    ['an unknown address', { found: null }],
    ['a disabled account', { found: user({ isActive: false }) }],
    // An invite that was never accepted has no password, so it cannot password-login.
    ['a password-less account', { found: user({ passwordHash: null }) }],
    ['a wrong password', { passwordOk: false }],
  ])('answers a generic 401 for %s', async (_label, opts) => {
    const { svc } = setup(opts);
    await expect(svc.validateCredentials('ada@x.dev', 'Password1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  describe('the unverified gate (#118)', () => {
    it('refuses a login while the address is unconfirmed', async () => {
      const { svc } = setup({ found: user({ emailVerifiedAt: null }) });
      const err = await svc.validateCredentials('ada@x.dev', 'Password1').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err).toMatchObject({ response: { reason: 'email_unverified' } });
    });

    /**
     * THE ordering property, and the reason this gate sits after the password check.
     *
     * If an unverified account answered `email_unverified` to a caller who supplied
     * the WRONG password, the login form would become an enumeration oracle: a
     * distinguishable response would confirm the address has an account, which is
     * precisely what `forgot-password` and `resend-verification` go to such lengths
     * to avoid. Only someone who already holds the credentials may learn this.
     */
    it('reveals nothing to a caller who does not have the password', async () => {
      const { svc } = setup({ found: user({ emailVerifiedAt: null }), passwordOk: false });
      const err = await svc
        .validateCredentials('ada@x.dev', 'wrong-password')
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(err).not.toBeInstanceOf(ForbiddenException);
      // Byte-identical to the answer an unknown address gets.
      const { svc: other } = setup({ found: null });
      const unknown = await other
        .validateCredentials('nobody@x.dev', 'wrong-password')
        .catch((e: unknown) => e);
      expect((err as Error).message).toBe((unknown as Error).message);
    });

    // Cheap to state, and it is the invariant migration 1785590000000's backfill
    // exists to preserve: every pre-existing account carries a stamp, so nobody was
    // locked out when this gate shipped.
    it('lets a grandfathered account in', async () => {
      const { svc } = setup({ found: user({ emailVerifiedAt: new Date('2025-06-01') }) });
      await expect(svc.validateCredentials('ada@x.dev', 'Password1')).resolves.toBeTruthy();
    });
  });
});

describe('AuthService.register — a free address', () => {
  it('creates an open, unverified member of the community tenant and mails the link', async () => {
    const { svc, users, emailVerification, created } = setup({ byEmail: null });

    await svc.register(REGISTER);

    expect(users.createOpenSelfSignup).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@x.dev', passwordHash: '$argon2id$fresh' }),
      COMMUNITY_ID,
    );
    expect(emailVerification.issue).toHaveBeenCalledWith(created);
  });

  it('lowercases the address so case cannot create a second account', async () => {
    const { svc, users } = setup({ byEmail: null });
    await svc.register(REGISTER);
    expect(users.findByEmail).toHaveBeenCalledWith('new@x.dev');
  });

  // Registration yields a STUDENT and nothing else. The professor `inviteToken`
  // branch was retired: invites are their own surface, and they charge the org's
  // seat quota in the same transaction that consumes the invite, so a second
  // quota-free path into a role would make the two disagree. An open professor
  // arrives via an application a superadmin approves, which mints a real invite.
  it('never goes through the role-bearing create path', async () => {
    const { svc, users } = setup({ byEmail: null });
    await svc.register(REGISTER);
    expect(users.create).not.toHaveBeenCalled();
  });
});

/**
 * The enumeration contract. `users.email` is globally unique and this endpoint is
 * public, so nothing observable to the CALLER may differ between these branches —
 * the controller returns one fixed 200 either way, and this service must not throw.
 *
 * It used to answer 409 "Email already registered", which was precisely the oracle.
 */
describe('AuthService.register — an address that is taken', () => {
  it('resolves silently rather than throwing, for a verified account', async () => {
    const { svc } = setup({ byEmail: user({ emailVerifiedAt: new Date() }) });
    await expect(svc.register(REGISTER)).resolves.toBeUndefined();
  });

  it('tells the MAILBOX OWNER, not the caller', async () => {
    const owner = user({ emailVerifiedAt: new Date(), email: 'taken@x.dev' });
    const { svc, mail } = setup({ byEmail: owner });

    await svc.register(REGISTER);

    const msg = mail.enqueue.mock.calls[0][0] as { to: string; template: MailTemplate };
    expect(msg.to).toBe('taken@x.dev');
    expect(msg.template).toBe(MailTemplate.ACCOUNT_EXISTS);
  });

  // Anyone who can type an address can trigger that mail, so it must not be a way to
  // have a working credential delivered to someone else's inbox.
  it('sends no token in the account-exists mail', async () => {
    const { svc, mail } = setup({ byEmail: user({ emailVerifiedAt: new Date() }) });
    await svc.register(REGISTER);
    const { params } = mail.enqueue.mock.calls[0][0] as { params: Record<string, unknown> };
    expect(Object.keys(params)).toEqual(expect.arrayContaining(['loginUrl', 'forgotPasswordUrl']));
    expect(JSON.stringify(params)).not.toMatch(/token/i);
  });

  // A closed-origin account was invited or staff-created, so somebody already
  // vouched for the address — re-sending a verification link would be wrong, and
  // silently doing nothing would leave the owner unaware.
  it('treats an unverified CLOSED account as taken, not as a re-signup', async () => {
    const { svc, mail, emailVerification } = setup({
      byEmail: user({ emailVerifiedAt: null, origin: UserOrigin.CLOSED }),
    });

    await svc.register(REGISTER);

    expect(emailVerification.issue).not.toHaveBeenCalled();
    expect(mail.enqueue).toHaveBeenCalledTimes(1);
  });

  it('creates no second account in any taken branch', async () => {
    const { svc, users } = setup({ byEmail: user({ emailVerifiedAt: new Date() }) });
    await svc.register(REGISTER);
    expect(users.createOpenSelfSignup).not.toHaveBeenCalled();
  });
});

/**
 * The pre-registration takeover, which is why re-signup only re-sends a link.
 *
 * An attacker signs up as victim@x with their own password. The victim later signs up
 * "for the first time". If that second attempt overwrote the stored password the
 * victim would be fine — but if it did not, and the victim then verified via the
 * mailed link, the account would be verified while holding the attacker's password.
 * Overwriting is not the answer either: it would hand anyone a way to change the
 * password of any unverified account by re-submitting a signup form. So the
 * credential is left strictly alone and recovery goes through forgot-password, which
 * proves mailbox access.
 */
describe('AuthService.register — re-signup on an unverified OPEN account', () => {
  const pending = () => user({ emailVerifiedAt: null, origin: UserOrigin.OPEN });

  it('re-sends the verification link', async () => {
    const existing = pending();
    const { svc, emailVerification } = setup({ byEmail: existing });

    await svc.register(REGISTER);

    expect(emailVerification.issue).toHaveBeenCalledWith(existing);
  });

  it('does NOT touch the stored password or name', async () => {
    const existing = pending();
    const { svc, users } = setup({ byEmail: existing });

    await svc.register({ ...(REGISTER as object), firstName: 'Attacker' } as never);

    expect(users.createOpenSelfSignup).not.toHaveBeenCalled();
    expect(existing.passwordHash).toBe('$argon2id$existing');
    expect(existing.firstName).toBe('Ada');
  });

  it('sends no account-exists mail, since the account is not yet usable', async () => {
    const { svc, mail } = setup({ byEmail: pending() });
    await svc.register(REGISTER);
    expect(mail.enqueue).not.toHaveBeenCalled();
  });
});

/**
 * Timing. Having closed the oracle in the status domain, leaving argon2 out of the
 * taken branches would reopen it in the timing domain: ~100ms of hashing only on the
 * free path makes "taken" measurably faster to probe.
 */
describe('AuthService.register — latency shaping', () => {
  it.each([
    ['a free address', null],
    ['a verified account', user({ emailVerifiedAt: new Date() })],
    ['an unverified open account', user({ emailVerifiedAt: null, origin: UserOrigin.OPEN })],
  ])('hashes the submitted password for %s', async (_label, byEmail) => {
    const { svc, users } = setup({ byEmail: byEmail as User | null });
    await svc.register(REGISTER);
    expect(users.hashPassword).toHaveBeenCalledWith('Password1');
  });

  it('hashes BEFORE looking the address up, so the order cannot leak either', async () => {
    const order: string[] = [];
    const { svc, users } = setup({ byEmail: null });
    (users.hashPassword as jest.Mock).mockImplementation(() => {
      order.push('hash');
      return Promise.resolve('$argon2id$fresh');
    });
    (users.findByEmail as jest.Mock).mockImplementation(() => {
      order.push('lookup');
      return Promise.resolve(null);
    });

    await svc.register(REGISTER);

    expect(order).toEqual(['hash', 'lookup']);
  });
});
