import { Role } from '../../common/enums/role.enum';
import {
  ClerkUserData,
  isSuperAdminMetadata,
  mapClerkOrgRole,
  primaryEmailOf,
} from './clerk-webhook.types';

describe('mapClerkOrgRole', () => {
  it.each([
    ['org:admin', Role.ADMIN],
    ['admin', Role.ADMIN],
    ['ORG:ADMIN', Role.ADMIN],
    ['org:professor', Role.PROFESSOR],
    ['professor', Role.PROFESSOR],
    ['org:member', Role.STUDENT],
    ['org:student', Role.STUDENT],
    ['something-weird', Role.STUDENT],
    ['', Role.STUDENT],
  ])('maps %s -> %s', (input, expected) => {
    expect(mapClerkOrgRole(input)).toBe(expected);
  });

  it('defaults null/undefined to the least-privileged STUDENT', () => {
    expect(mapClerkOrgRole(null)).toBe(Role.STUDENT);
    expect(mapClerkOrgRole(undefined)).toBe(Role.STUDENT);
  });
});

describe('isSuperAdminMetadata', () => {
  it('is true only for the superadmin metadata role (case-insensitive)', () => {
    expect(isSuperAdminMetadata({ role: 'superadmin' })).toBe(true);
    expect(isSuperAdminMetadata({ role: 'SuperAdmin' })).toBe(true);
    expect(isSuperAdminMetadata({ role: 'admin' })).toBe(false);
    expect(isSuperAdminMetadata({})).toBe(false);
    expect(isSuperAdminMetadata(null)).toBe(false);
    expect(isSuperAdminMetadata(undefined)).toBe(false);
  });
});

describe('primaryEmailOf', () => {
  it('returns the primary email address', () => {
    const user = {
      id: 'user_1',
      email_addresses: [
        { id: 'e1', email_address: 'secondary@x.dev' },
        { id: 'e2', email_address: 'primary@x.dev' },
      ],
      primary_email_address_id: 'e2',
    } as ClerkUserData;
    expect(primaryEmailOf(user)).toBe('primary@x.dev');
  });

  it('falls back to the first address when no primary is marked', () => {
    const user = {
      id: 'user_1',
      email_addresses: [{ id: 'e1', email_address: 'only@x.dev' }],
      primary_email_address_id: null,
    } as ClerkUserData;
    expect(primaryEmailOf(user)).toBe('only@x.dev');
  });

  it('returns null when there are no email addresses', () => {
    expect(primaryEmailOf({ id: 'user_1', email_addresses: [] } as ClerkUserData)).toBeNull();
    expect(primaryEmailOf({ id: 'user_1' } as ClerkUserData)).toBeNull();
  });
});
