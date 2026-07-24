import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Organization } from './entities/organization.entity';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsService', () => {
  const makeRepo = (overrides: Partial<Repository<Organization>> = {}) =>
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
});
