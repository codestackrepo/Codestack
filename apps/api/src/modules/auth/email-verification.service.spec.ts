import { ForbiddenException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { MailTemplate } from '../mail/mail.types';
import { User } from '../users/entities/user.entity';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { EmailVerificationService } from './email-verification.service';

/**
 * Mirrors `password-reset.service.spec.ts` case for case, deliberately. The two
 * services are structurally identical and the guarantees they must hold are the
 * same — enumeration safety, sweep-then-mint, single-use via `affected`, a preview
 * that never throws. Keeping the specs parallel is what makes a divergence between
 * the two visible as a missing test rather than an invisible weakening.
 */

const user = (over: Partial<User> = {}): User =>
  ({
    id: 'u-1',
    email: 'ada@x.dev',
    firstName: 'Ada',
    lastName: 'Lovelace',
    isActive: true,
    emailVerifiedAt: null,
    ...over,
  }) as User;

const tokenRow = (over: Partial<EmailVerificationToken> = {}): EmailVerificationToken =>
  ({
    id: 't-1',
    userId: 'u-1',
    tokenHash: 'hash',
    expiresAt: new Date(Date.now() + 3_600_000),
    usedAt: null,
    ...over,
  }) as EmailVerificationToken;

interface Opts {
  foundUser?: User | null;
  foundToken?: EmailVerificationToken | null;
  userById?: User | null;
  consumeAffected?: number;
}

function setup(opts: Opts = {}) {
  const sql: string[] = [];

  const tokenQb = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest
      .fn()
      .mockResolvedValue(opts.foundToken === undefined ? tokenRow() : opts.foundToken),
  };

  const tokens = { createQueryBuilder: jest.fn(() => tokenQb) };
  const userRepo = {
    // `requestVerification` uses findOne (no password column needed, unlike reset).
    findOne: jest
      .fn()
      .mockImplementation(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          'email' in where
            ? opts.foundUser === undefined
              ? user()
              : opts.foundUser
            : opts.userById === undefined
              ? user()
              : opts.userById,
        ),
      ),
  };

  const managerQuery = jest.fn((text: string) => {
    sql.push(text);
    return Promise.resolve([]);
  });

  const updateBuilder: Record<string, jest.Mock> = {
    update: jest.fn(() => updateBuilder),
    set: jest.fn(() => updateBuilder),
    where: jest.fn((clause: string) => {
      sql.push(`UPDATE email_verification_tokens ${clause}`);
      return updateBuilder;
    }),
    execute: jest.fn(() => Promise.resolve({ affected: opts.consumeAffected ?? 1 })),
  };
  const manager = {
    query: managerQuery,
    createQueryBuilder: jest.fn(() => updateBuilder),
  } as unknown as EntityManager;

  const dataSource = {
    getRepository: jest.fn(() => userRepo),
    transaction: jest.fn((cb: (m: EntityManager) => unknown) => cb(manager)),
  } as unknown as DataSource;

  const mail = {
    enqueue: jest.fn().mockResolvedValue(undefined),
    webUrl: jest.fn((p: string) => `https://app.dev/${p}`),
  };

  const svc = new EmailVerificationService(
    tokens as unknown as Repository<EmailVerificationToken>,
    dataSource,
    mail as unknown as MailService,
  );
  return { svc, mail, sql, managerQuery, userRepo };
}

describe('EmailVerificationService.requestVerification', () => {
  it('mints a token and mails a link for a real, unverified, active account', async () => {
    const { svc, mail, sql } = setup();
    await svc.requestVerification('ada@x.dev');

    expect(sql.some((s) => s.includes('INSERT INTO email_verification_tokens'))).toBe(true);
    const msg = mail.enqueue.mock.calls[0][0] as {
      template: MailTemplate;
      params: { verifyUrl: string; expiresInHours: number };
    };
    expect(msg.template).toBe(MailTemplate.VERIFY_EMAIL);
    expect(msg.params.expiresInHours).toBe(24);
    expect(msg.params.verifyUrl).toContain('/verify-email/');
  });

  // Re-requesting must not leave two working links: the older one is likely in a
  // mail the user already ignored, or forwarded.
  it('invalidates every prior live token before minting a new one', async () => {
    const { svc, sql } = setup();
    await svc.requestVerification('ada@x.dev');

    const sweep = sql.findIndex((s) => s.includes('UPDATE email_verification_tokens SET used_at'));
    const insert = sql.findIndex((s) => s.includes('INSERT INTO email_verification_tokens'));
    expect(sweep).toBeGreaterThanOrEqual(0);
    expect(sweep).toBeLessThan(insert);
  });

  it('mails a link whose token is not the stored hash', async () => {
    const { svc, mail, sql } = setup();
    await svc.requestVerification('ada@x.dev');
    const { params } = mail.enqueue.mock.calls[0][0] as { params: { verifyUrl: string } };
    const raw = params.verifyUrl.split('/').pop() as string;
    // The hash is what is persisted; the raw value exists only in the mail.
    expect(sql.join('\n')).not.toContain(raw);
  });
});

/**
 * Enumeration safety. `users.email` is globally unique, so any observable
 * difference between these branches and the happy path is a definite "this address
 * has an account" on a public, unauthenticated endpoint.
 */
describe('EmailVerificationService.requestVerification — the silent branches', () => {
  it('does nothing for an unknown address', async () => {
    const { svc, mail, sql } = setup({ foundUser: null });
    await expect(svc.requestVerification('nobody@x.dev')).resolves.toBeUndefined();
    expect(mail.enqueue).not.toHaveBeenCalled();
    expect(sql).toHaveLength(0);
  });

  it('does nothing for a disabled account', async () => {
    const { svc, mail, sql } = setup({ foundUser: user({ isActive: false }) });
    await expect(svc.requestVerification('ada@x.dev')).resolves.toBeUndefined();
    expect(mail.enqueue).not.toHaveBeenCalled();
    expect(sql).toHaveLength(0);
  });

  // Re-sending to an already-verified address would be a no-op that nonetheless
  // confirms the address exists.
  it('does nothing for an already-verified account', async () => {
    const { svc, mail, sql } = setup({ foundUser: user({ emailVerifiedAt: new Date() }) });
    await expect(svc.requestVerification('ada@x.dev')).resolves.toBeUndefined();
    expect(mail.enqueue).not.toHaveBeenCalled();
    expect(sql).toHaveLength(0);
  });

  it('lowercases the lookup so case cannot dodge the checks', async () => {
    const { svc, userRepo } = setup();
    await svc.requestVerification('AdA@X.DEV');
    expect(userRepo.findOne).toHaveBeenCalledWith({ where: { email: 'ada@x.dev' } });
  });
});

describe('EmailVerificationService.issue', () => {
  // The signup path has already established the user exists and is unverified;
  // routing it through the silent lookup would re-query and, worse, would send
  // nothing at all if those branch conditions ever drifted.
  it('mints and mails without re-checking the account', async () => {
    const { svc, mail, sql } = setup({ foundUser: null });
    await svc.issue(user());
    expect(sql.some((s) => s.includes('INSERT INTO email_verification_tokens'))).toBe(true);
    expect(mail.enqueue).toHaveBeenCalledTimes(1);
  });

  it('writes through a caller-supplied manager so the mint joins its transaction', async () => {
    const { svc, mail } = setup();
    const calls: string[] = [];
    const outer = {
      query: jest.fn((text: string) => {
        calls.push(text);
        return Promise.resolve([]);
      }),
    } as unknown as EntityManager;

    await svc.issue(user(), outer);

    expect(calls.some((s) => s.includes('INSERT INTO email_verification_tokens'))).toBe(true);
    // Still enqueued afterwards: enqueue never throws, and a rollback cannot unsend.
    expect(mail.enqueue).toHaveBeenCalledTimes(1);
  });
});

/**
 * `preview` must never throw: a 4xx puts the raw token into AllExceptionsFilter's
 * `path` field and from there into the application log.
 */
describe('EmailVerificationService.preview', () => {
  it('reports valid with a masked address and nothing else', async () => {
    const { svc } = setup();
    const out = await svc.preview('raw');
    expect(out.status).toBe('valid');
    expect(out.maskedEmail).toBe('ad•••@x.dev');
    expect(out).not.toHaveProperty('role');
    expect(out).not.toHaveProperty('organizationId');
  });

  it.each([
    ['not_found', { foundToken: null }],
    ['used', { foundToken: tokenRow({ usedAt: new Date() }) }],
    ['expired', { foundToken: tokenRow({ expiresAt: new Date(Date.now() - 1_000) }) }],
  ])('reports %s without throwing', async (status, opts) => {
    const { svc } = setup(opts as Opts);
    await expect(svc.preview('raw')).resolves.toEqual({ status });
  });

  it('reports not_found for a deleted or disabled user rather than leaking the state', async () => {
    const { svc } = setup({ userById: user({ isActive: false }) });
    await expect(svc.preview('raw')).resolves.toEqual({ status: 'not_found' });
  });

  it('swallows an infrastructure failure into not_found', async () => {
    const { svc } = setup();
    jest
      .spyOn(svc as unknown as { findByToken: () => Promise<never> }, 'findByToken')
      .mockRejectedValue(new Error('connection terminated'));
    await expect(svc.preview('raw')).resolves.toEqual({ status: 'not_found' });
  });
});

describe('EmailVerificationService.verify', () => {
  it('consumes the token and stamps the address verified', async () => {
    const { svc, sql } = setup();
    const result = await svc.verify('raw');

    expect(sql.some((s) => s.includes('used_at IS NULL'))).toBe(true);
    expect(sql.some((s) => s.includes('email_verified_at = now()'))).toBe(true);
    expect(result.emailVerifiedAt).toBeInstanceOf(Date);
  });

  // The single-use control. A read-then-write would let two simultaneous clicks
  // both pass the check — and mail clients pre-fetch links, so a scanner and the
  // human genuinely do race.
  it('rejects when the conditional UPDATE affects no row', async () => {
    const { svc } = setup({ consumeAffected: 0 });
    await expect(svc.verify('raw')).rejects.toMatchObject({
      response: { reason: 'verify_token_used' },
    });
  });

  it('only stamps a first verification, so the original time survives', async () => {
    const { svc, sql } = setup();
    await svc.verify('raw');
    const stamp = sql.find((s) => s.includes('email_verified_at = now()')) as string;
    expect(stamp).toContain('email_verified_at IS NULL');
  });

  it.each([
    ['verify_token_invalid', { foundToken: null }],
    ['verify_token_used', { foundToken: tokenRow({ usedAt: new Date() }) }],
    ['verify_token_expired', { foundToken: tokenRow({ expiresAt: new Date(Date.now() - 1_000) }) }],
  ])('throws %s for an unusable token', async (reason, opts) => {
    const { svc } = setup(opts as Opts);
    await expect(svc.verify('raw')).rejects.toMatchObject({ response: { reason } });
  });

  // Distinguishable on purpose: the holder already proved mailbox access, so naming
  // the disabled account reveals nothing they could not learn by trying to sign in,
  // and silence would be baffling for someone who just clicked a link.
  it('names a disabled account rather than pretending the token is bad', async () => {
    const { svc } = setup({ userById: user({ isActive: false }) });
    const err = await svc.verify('raw').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err).toMatchObject({ response: { reason: 'account_disabled' } });
  });

  it('does not stamp anything when the token is unusable', async () => {
    const { svc, sql } = setup({ foundToken: null });
    await svc.verify('raw').catch(() => undefined);
    expect(sql.some((s) => s.includes('email_verified_at'))).toBe(false);
  });
});
