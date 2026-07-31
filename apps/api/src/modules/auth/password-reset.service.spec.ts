import { ForbiddenException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { MailTemplate } from '../mail/mail.types';
import { hashToken } from '../invites/invite-token.util';
import { User } from '../users/entities/user.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { maskEmail, PasswordResetService } from './password-reset.service';

const user = (over: Partial<User> = {}): User =>
  ({
    id: 'u-1',
    email: 'ada@x.dev',
    firstName: 'Ada',
    lastName: 'Lovelace',
    isActive: true,
    passwordHash: '$argon2id$existing',
    ...over,
  }) as User;

const tokenRow = (over: Partial<PasswordResetToken> = {}): PasswordResetToken =>
  ({
    id: 't-1',
    userId: 'u-1',
    tokenHash: 'hash',
    expiresAt: new Date(Date.now() + 3_600_000),
    usedAt: null,
    ...over,
  }) as PasswordResetToken;

interface Opts {
  foundUser?: User | null;
  foundToken?: PasswordResetToken | null;
  userById?: User | null;
  consumeAffected?: number;
}

function setup(opts: Opts = {}) {
  const sql: string[] = [];

  const userQb = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(opts.foundUser === undefined ? user() : opts.foundUser),
  };
  const tokenQb = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest
      .fn()
      .mockResolvedValue(opts.foundToken === undefined ? tokenRow() : opts.foundToken),
  };

  const tokens = { createQueryBuilder: jest.fn(() => tokenQb) };
  const userRepo = {
    createQueryBuilder: jest.fn(() => userQb),
    findOne: jest.fn().mockResolvedValue(opts.userById === undefined ? user() : opts.userById),
  };

  const managerQuery = jest.fn((text: string) => {
    sql.push(text);
    return Promise.resolve([]);
  });

  // The consume goes through the QueryBuilder, not manager.query — `UPDATE ...
  // RETURNING` through the raw driver returns a [rows, count] tuple, so the
  // builder's `affected` is the only honest way to read it.
  const updateBuilder: Record<string, jest.Mock> = {
    update: jest.fn(() => updateBuilder),
    set: jest.fn(() => updateBuilder),
    where: jest.fn((clause: string) => {
      sql.push(`UPDATE password_reset_tokens ${clause}`);
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

  const svc = new PasswordResetService(
    tokens as unknown as Repository<PasswordResetToken>,
    dataSource,
    mail as unknown as MailService,
  );
  return { svc, mail, sql, managerQuery, userRepo };
}

describe('PasswordResetService.requestReset', () => {
  it('mints a token and mails a link for a real, active account', async () => {
    const { svc, mail, sql } = setup();
    await svc.requestReset('ada@x.dev');
    expect(sql.some((s) => s.includes('INSERT INTO password_reset_tokens'))).toBe(true);
    const msg = mail.enqueue.mock.calls[0][0] as {
      template: MailTemplate;
      params: { resetUrl: string; expiresInMinutes: number };
    };
    expect(msg.template).toBe(MailTemplate.PASSWORD_RESET);
    expect(msg.params.expiresInMinutes).toBe(60);
    expect(msg.params.resetUrl).toContain('/reset-password/');
  });

  // Requesting twice must not leave two working links — the older one is likely
  // in a mail the user already decided to ignore.
  it('invalidates every prior LIVE token before inserting the new one', async () => {
    const { svc, sql } = setup();
    await svc.requestReset('ada@x.dev');
    const invalidate = sql.findIndex(
      (s) => s.includes('UPDATE password_reset_tokens') && s.includes('used_at IS NULL'),
    );
    const insert = sql.findIndex((s) => s.includes('INSERT INTO password_reset_tokens'));
    expect(invalidate).toBeGreaterThanOrEqual(0);
    expect(invalidate).toBeLessThan(insert);
  });

  // THE contract. users.email is globally unique, so any observable difference
  // between these cases is a definite "this person has an account here".
  describe('non-enumeration', () => {
    const silentCases: [string, Opts][] = [
      ['an unknown address', { foundUser: null }],
      ['a disabled account', { foundUser: user({ isActive: false }) }],
      ['an invited account with no password yet', { foundUser: user({ passwordHash: null }) }],
    ];

    it.each(silentCases)('resolves without throwing for %s', async (_label, opts) => {
      const { svc } = setup(opts);
      await expect(svc.requestReset('ada@x.dev')).resolves.toBeUndefined();
    });

    it.each(silentCases)('sends no mail and writes no row for %s', async (_label, opts) => {
      const { svc, mail, sql } = setup(opts);
      await svc.requestReset('ada@x.dev');
      expect(mail.enqueue).not.toHaveBeenCalled();
      expect(sql).toEqual([]);
    });
  });

  it('looks the address up case-insensitively', async () => {
    const { svc } = setup();
    await svc.requestReset('ADA@X.DEV');
    // The service lowercases before querying; the qb mock records the params.
    await expect(svc.requestReset('ADA@X.DEV')).resolves.toBeUndefined();
  });

  it('mails AFTER the transaction — a rollback cannot unsend it', async () => {
    const order: string[] = [];
    const { svc, mail } = setup();
    mail.enqueue.mockImplementation(() => {
      order.push('mail');
      return Promise.resolve();
    });
    const ds = (svc as unknown as { dataSource: { transaction: jest.Mock } }).dataSource;
    const real = ds.transaction.getMockImplementation()!;
    ds.transaction.mockImplementation(async (cb: (m: EntityManager) => unknown) => {
      const out = await real(cb);
      order.push('commit');
      return out;
    });
    await svc.requestReset('ada@x.dev');
    expect(order).toEqual(['commit', 'mail']);
  });
});

describe('PasswordResetService.preview', () => {
  // A 4xx would put the raw token into AllExceptionsFilter's `path` field and
  // thence into the application log.
  it('NEVER throws for an unknown token', async () => {
    const { svc } = setup({ foundToken: null });
    await expect(svc.preview('nope')).resolves.toEqual({ status: 'not_found' });
  });

  it('NEVER throws when the lookup itself blows up', async () => {
    const { svc } = setup();
    const tokens = (svc as unknown as { tokens: { createQueryBuilder: jest.Mock } }).tokens;
    tokens.createQueryBuilder.mockImplementation(() => {
      throw new Error('db down');
    });
    await expect(svc.preview('t')).resolves.toEqual({ status: 'not_found' });
  });

  it('reports used and expired distinctly, so the page can explain itself', async () => {
    const used = setup({ foundToken: tokenRow({ usedAt: new Date() }) });
    await expect(used.svc.preview('t')).resolves.toEqual({ status: 'used' });

    const expired = setup({ foundToken: tokenRow({ expiresAt: new Date(Date.now() - 1000) }) });
    await expect(expired.svc.preview('t')).resolves.toEqual({ status: 'expired' });
  });

  it('returns a MASKED address for a valid token — never the raw one', async () => {
    const { svc } = setup();
    const out = await svc.preview('t');
    expect(out.status).toBe('valid');
    expect(out.maskedEmail).toBe('ad•••@x.dev');
    expect(out.maskedEmail).not.toBe('ada@x.dev');
  });

  it('discloses no role and no organization', async () => {
    const { svc } = setup();
    const out = await svc.preview('t');
    expect(Object.keys(out).sort()).toEqual(['maskedEmail', 'status']);
  });

  it('reports not_found for a disabled account rather than confirming it exists', async () => {
    const { svc } = setup({ userById: user({ isActive: false }) });
    await expect(svc.preview('t')).resolves.toEqual({ status: 'not_found' });
  });
});

describe('PasswordResetService.resetPassword', () => {
  it('consumes the token and writes the new hash', async () => {
    const { svc, sql } = setup();
    await expect(svc.resetPassword('t', 'Password1')).resolves.toMatchObject({ id: 'u-1' });
    expect(sql.some((s) => s.includes('UPDATE password_reset_tokens'))).toBe(true);
    expect(sql.some((s) => s.includes('UPDATE users SET password_hash'))).toBe(true);
  });

  it('hashes with argon2, never storing the plaintext', async () => {
    const { svc, managerQuery } = setup();
    await svc.resetPassword('t', 'Password1');
    const calls = managerQuery.mock.calls as unknown as [string, string[]][];
    const call = calls.find((c) => c[0].includes('UPDATE users SET password_hash'));
    const [hash] = call![1];
    expect(hash).toMatch(/^\$argon2/);
    expect(hash).not.toContain('Password1');
  });

  // The single-use control. A read-then-write would let two simultaneous
  // submissions of the same link both pass and both set a password.
  it('is a CONDITIONAL update — a lost race reports the token as used', async () => {
    const { svc, sql } = setup({ consumeAffected: 0 });
    await expect(svc.resetPassword('t', 'Password1')).rejects.toMatchObject({
      response: { reason: 'reset_token_used' },
    });
    const consume = sql.find((s) => s.includes('UPDATE password_reset_tokens'))!;
    expect(consume).toContain('used_at IS NULL');
  });

  it('never writes the password when the consume loses the race', async () => {
    const { svc, sql } = setup({ consumeAffected: 0 });
    await expect(svc.resetPassword('t', 'Password1')).rejects.toThrow();
    expect(sql.some((s) => s.includes('UPDATE users SET password_hash'))).toBe(false);
  });

  it.each([
    ['an unknown token', { foundToken: null } as Opts, 'reset_token_invalid'],
    ['an already-used token', { foundToken: tokenRow({ usedAt: new Date() }) }, 'reset_token_used'],
    [
      'an expired token',
      { foundToken: tokenRow({ expiresAt: new Date(Date.now() - 1000) }) },
      'reset_token_expired',
    ],
  ])('rejects %s', async (_label, opts, reason) => {
    const { svc } = setup(opts);
    await expect(svc.resetPassword('t', 'Password1')).rejects.toMatchObject({
      response: { reason },
    });
  });

  // Distinguishable on purpose here: the holder already proved mailbox access, so
  // this reveals nothing they could not learn by trying to sign in.
  it('403 account_disabled for a deactivated account', async () => {
    const { svc } = setup({ userById: user({ isActive: false }) });
    await expect(svc.resetPassword('t', 'Password1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.resetPassword('t', 'Password1')).rejects.toMatchObject({
      response: { reason: 'account_disabled' },
    });
  });

  it('looks the token up by HASH, never by the raw value', async () => {
    const { svc } = setup();
    const tokens = (svc as unknown as { tokens: { createQueryBuilder: jest.Mock } }).tokens;
    await svc.resetPassword('raw-token-value', 'Password1');
    const qb = tokens.createQueryBuilder.mock.results[0].value as { where: jest.Mock };
    const [, params] = qb.where.mock.calls[0] as [string, { hash: string }];
    expect(params.hash).toBe(hashToken('raw-token-value'));
    expect(params.hash).not.toBe('raw-token-value');
  });
});

describe('maskEmail', () => {
  it('keeps two characters and the domain', () => {
    expect(maskEmail('ada.lovelace@example.edu')).toBe('ad••••••••••@example.edu');
  });

  // A 3-dot floor, so a two- or three-character local part is not given away by
  // counting the dots.
  it('never renders fewer than three dots, however short the local part', () => {
    for (const email of ['a@x.dev', 'ab@x.dev', 'abc@x.dev']) {
      const masked = maskEmail(email);
      expect(masked.split('@')[0].replace(/[^•]/g, '').length).toBeGreaterThanOrEqual(3);
    }
  });

  it('never returns the original', () => {
    for (const email of ['a@x.dev', 'ab@x.dev', 'abc@x.dev']) {
      expect(maskEmail(email)).not.toBe(email);
    }
  });

  it('degrades safely on a malformed address', () => {
    expect(maskEmail('not-an-email')).toBe('•••');
  });
});
