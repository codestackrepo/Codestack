import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { OrganizationStatus, OrganizationType } from './enums/organization.enums';
import { Organization } from './entities/organization.entity';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsService', () => {
  const makeRepo = (overrides: Record<string, unknown> = {}) =>
    ({ findOne: jest.fn(), find: jest.fn(), ...overrides }) as unknown as Repository<Organization>;

  it('getById returns the org when found', async () => {
    const org = { id: 'o1', name: 'MIT' } as Organization;
    const repo = makeRepo({ findOne: jest.fn().mockResolvedValue(org) });
    const service = new OrganizationsService(repo);
    await expect(service.getById('o1')).resolves.toBe(org);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'o1' } });
  });

  it('getById throws NotFound when absent', async () => {
    const repo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
    const service = new OrganizationsService(repo);
    await expect(service.getById('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findById returns null (does not throw) when absent', async () => {
    const repo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
    const service = new OrganizationsService(repo);
    await expect(service.findById('missing')).resolves.toBeNull();
  });

  it('findBySlug queries by slug', async () => {
    const repo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
    const service = new OrganizationsService(repo);
    await service.findBySlug('mit');
    expect(repo.findOne).toHaveBeenCalledWith({ where: { slug: 'mit' } });
  });

  describe('upsertFromClerk (#52)', () => {
    it('updates the name of an existing mirror without churning the slug', async () => {
      const existing = { id: 'o1', name: 'Old', slug: 'acme', clerkOrgId: 'org_1' } as Organization;
      const save = jest.fn((o) => Promise.resolve(o));
      const repo = makeRepo({ findOne: jest.fn().mockResolvedValue(existing), save });
      const service = new OrganizationsService(repo);
      const out = await service.upsertFromClerk({
        clerkOrgId: 'org_1',
        name: 'Acme University',
        slug: 'renamed-in-clerk',
      });
      expect(out.name).toBe('Acme University');
      expect(out.slug).toBe('acme'); // slug preserved
    });

    it('creates a new mirror with the clerk slug when free', async () => {
      const findOne = jest
        .fn()
        .mockResolvedValueOnce(null) // by clerkOrgId — miss
        .mockResolvedValueOnce(null); // slug availability — free
      const repo = makeRepo({
        findOne,
        create: jest.fn((d) => d),
        save: jest.fn((o) => Promise.resolve({ ...o, id: 'new' })),
      });
      const service = new OrganizationsService(repo);
      const out = await service.upsertFromClerk({
        clerkOrgId: 'org_2',
        name: 'MIT',
        slug: 'mit',
      });
      expect(out.slug).toBe('mit');
      expect(out.clerkOrgId).toBe('org_2');
    });

    it('suffixes the slug when a DIFFERENT clerk org already owns it', async () => {
      const findOne = jest
        .fn()
        .mockResolvedValueOnce(null) // by clerkOrgId — miss
        .mockResolvedValueOnce({ id: 'other', clerkOrgId: 'org_other' }) // slug owned by another clerk org — no link
        .mockResolvedValueOnce({ id: 'other' }); // uniqueSlug: slug taken -> suffix
      const repo = makeRepo({
        findOne,
        create: jest.fn((d) => d),
        save: jest.fn((o) => Promise.resolve(o)),
      });
      const service = new OrganizationsService(repo);
      const out = await service.upsertFromClerk({
        clerkOrgId: 'org_abcdef123456',
        name: 'MIT',
        slug: 'mit',
      });
      expect(out.slug).toMatch(/^mit-/);
    });

    it('is race-safe: re-reads the winner on a 23505 during create', async () => {
      const winner = { id: 'o9', clerkOrgId: 'org_3' } as Organization;
      const findOne = jest
        .fn()
        .mockResolvedValueOnce(null) // by clerkOrgId — miss
        .mockResolvedValueOnce(null) // slug-fallback — miss
        .mockResolvedValueOnce(null) // uniqueSlug — slug free
        .mockResolvedValueOnce(winner); // re-find after the race
      const driver = Object.assign(new Error('dup'), { code: '23505' });
      const repo = makeRepo({
        findOne,
        create: jest.fn((d) => d),
        save: jest
          .fn()
          .mockRejectedValueOnce(new QueryFailedError('q', [], driver as unknown as Error)),
      });
      const service = new OrganizationsService(repo);
      await expect(
        service.upsertFromClerk({ clerkOrgId: 'org_3', name: 'X', slug: 'x' }),
      ).resolves.toBe(winner);
    });
  });

  it('suspendByClerkId flips status to SUSPENDED', async () => {
    const update = jest.fn().mockResolvedValue({ affected: 1 });
    const repo = makeRepo({ update });
    const service = new OrganizationsService(repo);
    await service.suspendByClerkId('org_1');
    expect(update).toHaveBeenCalledWith(
      { clerkOrgId: 'org_1' },
      { status: OrganizationStatus.SUSPENDED },
    );
  });

  describe('SuperAdmin CRUD (#62)', () => {
    it('create slugifies the name and persists an active org', async () => {
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue(null), // slug free
        create: jest.fn((d) => d),
        save: jest.fn((o) => Promise.resolve({ ...o, id: 'o1' })),
      });
      const service = new OrganizationsService(repo);
      const out = await service.create({ name: 'Acme University!', createdById: 'sa' });
      expect(out.slug).toBe('acme-university');
      expect(out.status).toBe(OrganizationStatus.ACTIVE);
      expect(out.createdById).toBe('sa');
    });

    it('create throws 409 when the slug is already taken', async () => {
      const repo = makeRepo({ findOne: jest.fn().mockResolvedValue({ id: 'other' }) });
      const service = new OrganizationsService(repo);
      await expect(
        service.create({ name: 'Acme', slug: 'acme', createdById: 'sa' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('update applies name and type', async () => {
      const existing = { id: 'o1', name: 'Old', type: OrganizationType.UNIVERSITY } as Organization;
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue(existing),
        save: jest.fn((o) => Promise.resolve(o)),
      });
      const service = new OrganizationsService(repo);
      const out = await service.update('o1', {
        name: 'New',
        type: OrganizationType.ORGANIZATION,
      });
      expect(out.name).toBe('New');
      expect(out.type).toBe(OrganizationType.ORGANIZATION);
    });

    it('setStatus flips the status', async () => {
      const existing = { id: 'o1', status: OrganizationStatus.ACTIVE } as Organization;
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue(existing),
        save: jest.fn((o) => Promise.resolve(o)),
      });
      const service = new OrganizationsService(repo);
      const out = await service.setStatus('o1', OrganizationStatus.SUSPENDED);
      expect(out.status).toBe(OrganizationStatus.SUSPENDED);
    });

    it('slugify normalizes to a url-safe form', () => {
      const service = new OrganizationsService(makeRepo());
      expect(service.slugify('Acme  University! 2026')).toBe('acme-university-2026');
      expect(service.slugify('')).toBe('org');
    });

    it('upsertFromClerk links a platform-created org by slug instead of duplicating', async () => {
      const bySlug = { id: 'o1', slug: 'acme', clerkOrgId: null } as Organization;
      const create = jest.fn((d) => d);
      const repo = makeRepo({
        findOne: jest
          .fn()
          .mockResolvedValueOnce(null) // by clerkOrgId — miss
          .mockResolvedValueOnce(bySlug), // by slug — unlinked hit
        save: jest.fn((o) => Promise.resolve(o)),
        create,
      });
      const service = new OrganizationsService(repo);
      const out = await service.upsertFromClerk({
        clerkOrgId: 'org_clerk_1',
        name: 'Acme U',
        slug: 'acme',
      });
      expect(out.clerkOrgId).toBe('org_clerk_1');
      expect(create).not.toHaveBeenCalled();
    });
  });
});
