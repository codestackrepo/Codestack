import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './entities/organization.entity';

/**
 * Read access to the tenant root. This is the foundation slice (#48) — org CRUD,
 * suspend/activate, and the Clerk-org provisioning live in the SuperAdmin
 * platform console (#62). Kept intentionally small so later subsystems can
 * depend on it without a dependency cycle.
 */
@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization) private readonly repo: Repository<Organization>,
  ) {}

  findById(id: string): Promise<Organization | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** Like findById but throws 404 when absent. */
  async getById(id: string): Promise<Organization> {
    const org = await this.findById(id);
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  findBySlug(slug: string): Promise<Organization | null> {
    return this.repo.findOne({ where: { slug } });
  }

  list(): Promise<Organization[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }
}
