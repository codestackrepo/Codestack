import { Role } from '../../common/enums/role.enum';
import {
  clerkOrgRoleForRole,
  detectHasher,
  emptyReport,
  formatReport,
  parseArgs,
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
  it('defaults to a live run with no limit', () => {
    expect(parseArgs([])).toEqual({ dryRun: false, limit: undefined });
  });

  it('recognises --dry-run and a positive --limit', () => {
    expect(parseArgs(['--dry-run', '--limit=50'])).toEqual({ dryRun: true, limit: 50 });
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
