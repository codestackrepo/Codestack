import { Role } from '../../common/enums/role.enum';
import {
  clerkErrorDetail,
  clerkOrgRoleForRole,
  detectHasher,
  emptyReport,
  formatReport,
  parseArgs,
  requiresUsername,
  usernameFromEmail,
} from './import-users-to-clerk.util';

describe('detectHasher', () => {
  it('reads the hasher from the PHC prefix', () => {
    expect(detectHasher('$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA')).toBe('argon2id');
    expect(detectHasher('$argon2i$v=19$...')).toBe('argon2i');
    expect(detectHasher('$2b$12$abcdefghijklmnopqrstuv')).toBe('bcrypt');
    expect(detectHasher('$2a$12$....')).toBe('bcrypt');
  });

  it('returns null for unknown / empty schemes (-> reset fallback)', () => {
    expect(detectHasher('plaintextoops')).toBeNull();
    expect(detectHasher('$5$sha256$...')).toBeNull();
    expect(detectHasher(null)).toBeNull();
    expect(detectHasher('')).toBeNull();
  });
});

describe('clerkOrgRoleForRole', () => {
  it('maps local roles to Clerk org roles; SUPERADMIN has no org role', () => {
    expect(clerkOrgRoleForRole(Role.SUPERADMIN)).toBeNull();
    expect(clerkOrgRoleForRole(Role.ADMIN)).toBe('org:admin');
    expect(clerkOrgRoleForRole(Role.PROFESSOR)).toBe('org:professor');
    expect(clerkOrgRoleForRole(Role.STUDENT)).toBe('org:member');
  });
});

describe('parseArgs', () => {
  it('defaults to a live run with no limit and NO password overwriting', () => {
    expect(parseArgs([])).toEqual({ dryRun: false, limit: undefined, syncPassword: false });
  });

  it('recognises --dry-run and a positive --limit', () => {
    expect(parseArgs(['--dry-run', '--limit=50'])).toEqual({
      dryRun: true,
      limit: 50,
      syncPassword: false,
    });
  });

  it('requires an explicit --sync-password to touch an existing Clerk credential', () => {
    expect(parseArgs(['--sync-password']).syncPassword).toBe(true);
  });

  it('ignores a non-positive / non-numeric limit', () => {
    expect(parseArgs(['--limit=0']).limit).toBeUndefined();
    expect(parseArgs(['--limit=abc']).limit).toBeUndefined();
  });
});

describe('formatReport', () => {
  it('summarises counts and lists the fallback users', () => {
    const report = emptyReport();
    report.imported = 3;
    report.fallback.push('reset-me@x.dev');
    const out = formatReport(report, false);
    expect(out).toContain('imported (with password): 3');
    expect(out).toContain('reset-me@x.dev');
  });

  it('marks a dry run in the header', () => {
    expect(formatReport(emptyReport(), true)).toContain('DRY RUN');
  });
});

describe('clerkErrorDetail', () => {
  it('surfaces the reason Clerk buries under "Unprocessable Entity"', () => {
    const err = {
      status: 422,
      message: 'Unprocessable Entity',
      errors: [
        {
          code: 'form_data_missing',
          longMessage: '["username"] data doesn\'t match user requirements set for this instance',
        },
      ],
    };
    const out = clerkErrorDetail(err);
    expect(out).toContain('422');
    expect(out).toContain('form_data_missing');
    expect(out).toContain('username');
  });

  it('falls back to the bare message when there is no error array', () => {
    expect(clerkErrorDetail({ status: 500, message: 'boom' })).toBe('500 boom');
    expect(clerkErrorDetail(new Error('offline'))).toContain('offline');
  });
});

describe('requiresUsername', () => {
  it('detects the instance-requires-username rejection', () => {
    expect(
      requiresUsername({
        errors: [{ code: 'form_data_missing', longMessage: '["username" "password"] data ...' }],
      }),
    ).toBe(true);
  });

  it('does not confuse other 422s for it', () => {
    expect(
      requiresUsername({ errors: [{ code: 'form_password_not_strong_enough', message: 'weak' }] }),
    ).toBe(false);
    expect(
      requiresUsername({ errors: [{ code: 'form_data_missing', longMessage: '["phone"]' }] }),
    ).toBe(false);
    expect(requiresUsername(new Error('nope'))).toBe(false);
  });
});

describe('usernameFromEmail', () => {
  it('derives a deterministic username from the local part', () => {
    expect(usernameFromEmail('professor@codecampus.dev')).toBe('professor');
    expect(usernameFromEmail('Alice@X.DEV')).toBe('alice');
  });

  it("pads below Clerk's 4-char minimum and strips disallowed characters", () => {
    expect(usernameFromEmail('bob@x.dev')).toBe('bob_usr');
    expect(usernameFromEmail('a.b+tag@x.dev')).toBe('abtag');
    expect(usernameFromEmail('!!@x.dev')).toBe('user');
  });
});
