import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Organization } from './entities/organization.entity';
import { OrganizationStatus, OrganizationType } from './enums/organization.enums';

/**
 * Tenant-root data access + writes. Reads (#48) plus the SuperAdmin org CRUD /
 * suspend-activate / Clerk-org linkage (#62). The Clerk-org provisioning itself
 * is orchestrated by PlatformService (it needs ClerkService); this service owns
 * the local rows so org writes stay in one place.
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
   * SuperAdmin org creation (#62). The Clerk org is created + linked separately by
   * PlatformService; this persists the authoritative local row. Slug is derived
   * (or taken) and must be unique — an explicit collision is a 409 (clearer than
   * silently suffixing, unlike the webhook path which has no user to inform).
   */
  async create(input: {
    name: string;
    slug?: string;
    type?: OrganizationType;
    createdById: string | null;
  }): Promise<Organization> {
    const slug = this.slugify(input.slug || input.name);
    const clash = await this.repo.findOne({ where: { slug } });
    if (clash) throw new ConflictException(`Organization slug "${slug}" is already taken`);
    const org = this.repo.create({
      name: input.name,
      slug,
      type: input.type ?? OrganizationType.UNIVERSITY,
      status: OrganizationStatus.ACTIVE,
      createdById: input.createdById,
    });
    try {
      return await this.repo.save(org);
    } catch (err) {
      const code = (err as { driverError?: { code?: string } })?.driverError?.code;
      if (err instanceof QueryFailedError && code === '23505') {
        throw new ConflictException(`Organization slug "${slug}" is already taken`);
      }
      throw err;
    }
  }

  /** SuperAdmin org edit (#62). Slug is intentionally immutable (it's an FK-adjacent identifier). */
  async update(
    id: string,
    patch: { name?: string; type?: OrganizationType },
  ): Promise<Organization> {
    const org = await this.getById(id);
    if (patch.name !== undefined) org.name = patch.name;
    if (patch.type !== undefined) org.type = patch.type;
    return this.repo.save(org);
  }

  /** SuperAdmin suspend/activate (#62). Caller must reload OrganizationCache after. */
  async setStatus(id: string, status: OrganizationStatus): Promise<Organization> {
    const org = await this.getById(id);
    org.status = status;
    return this.repo.save(org);
  }

  /** Link a local org to its Clerk Organization once created (#62). */
  async attachClerkOrgId(id: string, clerkOrgId: string): Promise<Organization> {
    const org = await this.getById(id);
    org.clerkOrgId = clerkOrgId;
    return this.repo.save(org);
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

    // Link a SuperAdmin-created org that already holds this slug but no clerk id
    // yet (POST /platform/organizations created the local row, then Clerk fired
    // organization.created) — link it rather than inserting a duplicate (#62).
    if (input.slug) {
      const bySlug = await this.repo.findOne({ where: { slug: this.slugify(input.slug) } });
      if (bySlug && !bySlug.clerkOrgId) {
        bySlug.clerkOrgId = input.clerkOrgId;
        if (input.name) bySlug.name = input.name;
        return this.repo.save(bySlug);
      }
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

  /** Normalize a name/slug to the canonical url-safe form (shared by create + webhook). */
  slugify(base: string): string {
    return (
      base
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 72) || 'org'
    );
  }

  /** Slugify `base`; if the slug is taken, suffix it with a stable slice of `seed`. */
  private async uniqueSlug(base: string, seed: string): Promise<string> {
    const slug = this.slugify(base);
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
