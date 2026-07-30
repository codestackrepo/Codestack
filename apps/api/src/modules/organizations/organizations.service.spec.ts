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

    it('create surfaces a concurrent same-slug insert as a 409, not a 500', async () => {
      // The pre-check and this catch are the same rule at two layers: the check is
      // for the common case, uq_organizations_slug is what actually holds under a
      // race, and both must reach the caller as the same 409.
      const driver = Object.assign(new Error('dup'), { code: '23505' });
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue(null), // slug looked free
        create: jest.fn((d) => d),
        save: jest
          .fn()
          .mockRejectedValueOnce(new QueryFailedError('q', [], driver as unknown as Error)),
      });
      const service = new OrganizationsService(repo);
      await expect(
        service.create({ name: 'Acme', slug: 'acme', createdById: 'sa' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
