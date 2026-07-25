import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Organization } from './entities/organization.entity';
import { OrganizationStatus } from './enums/organization.enums';

/**
 * Read access to the tenant root. This is the foundation slice (#48) — org CRUD,
 * suspend/activate, and the Clerk-org provisioning live in the SuperAdmin
 * platform console (#62). Kept intentionally small so later subsystems can
 * depend on it without a dependency cycle.
 */
@Injectable()
export class OrganizationsService {
  constructor(@InjectRepository(Organization) private readonly repo: Repository<Organization>) {}

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

  findByClerkOrgId(clerkOrgId: string): Promise<Organization | null> {
    return this.repo.findOne({ where: { clerkOrgId } });
  }

  /**
   * Webhook sync (#52) for `organization.created` / `.updated`, and for the org
   * embedded in a membership event. Upserts by clerkOrgId (idempotent, race-safe
   * on the partial-unique index). The slug is set only on create (deduped against
   * uq_organizations_slug) — an update never churns it, so a Clerk slug rename
   * can never collide an existing local slug.
   */
  async upsertFromClerk(input: {
    clerkOrgId: string;
    name: string;
    slug: string;
  }): Promise<Organization> {
    const existing = await this.repo.findOne({ where: { clerkOrgId: input.clerkOrgId } });
    if (existing) {
      if (input.name) existing.name = input.name;
      return this.repo.save(existing);
    }

    const org = this.repo.create({
      name: input.name || input.slug || 'Organization',
      slug: await this.uniqueSlug(input.slug || input.clerkOrgId, input.clerkOrgId),
      clerkOrgId: input.clerkOrgId,
    });
    try {
      return await this.repo.save(org);
    } catch (err) {
      // Race: a concurrent org/membership event already mirrored this Clerk org.
      const code = (err as { driverError?: { code?: string } })?.driverError?.code;
      if (err instanceof QueryFailedError && code === '23505') {
        const raced = await this.repo.findOne({ where: { clerkOrgId: input.clerkOrgId } });
        if (raced) return raced;
      }
      throw err;
    }
  }

  /** Webhook sync (#52): suspend the local mirror on `organization.deleted`. */
  async suspendByClerkId(clerkOrgId: string): Promise<void> {
    await this.repo.update({ clerkOrgId }, { status: OrganizationStatus.SUSPENDED });
  }

  /** Slugify `base`; if the slug is taken, suffix it with a stable slice of `seed`. */
  private async uniqueSlug(base: string, seed: string): Promise<string> {
    const slug =
      base
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 72) || 'org';
    const clash = await this.repo.findOne({ where: { slug } });
    if (!clash) return slug;
    const suffix =
      seed
        .replace(/[^a-z0-9]/gi, '')
        .slice(-6)
        .toLowerCase() || 'x';
    return `${slug}-${suffix}`.slice(0, 80);
  }
}
