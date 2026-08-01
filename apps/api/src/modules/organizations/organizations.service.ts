import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Organization } from './entities/organization.entity';
import { OrganizationStatus, OrganizationType } from './enums/organization.enums';
import { OrgBranding, parseOrgBranding } from './org-branding';

/**
 * Tenant-root data access + writes: reads (#48) plus the SuperAdmin org CRUD and
 * suspend/activate (#62). Every org write lives here so there is one place that
 * owns the tenant row.
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

  /**
   * SuperAdmin org creation (#62). Slug is derived (or taken) and must be unique —
   * an explicit collision is a 409 rather than a silent suffix, because there is a
   * human present to be told which name was rejected. The 23505 catch is the race
   * twin of the pre-check: two concurrent creates of the same name.
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
    patch: { name?: string; type?: OrganizationType; branding?: OrgBranding | null },
  ): Promise<Organization> {
    const org = await this.getById(id);
    if (patch.name !== undefined) org.name = patch.name;
    if (patch.type !== undefined) org.type = patch.type;

    if (patch.branding !== undefined) {
      /**
       * Validated HERE, at the write, and never at render (#118).
       *
       * A mail template must not throw: rendering happens on the BullMQ worker, so a
       * bad logo URL would burn five retries over eight minutes and park a failed job —
       * for a value someone typed into a settings form months earlier. Refusing it at
       * the boundary puts the error in front of the person who can fix it.
       *
       * `parseOrgBranding` throws `InvalidBrandingError`; the caller maps it to a 400.
       * `undefined` back from it means "nothing usable was supplied", which is how
       * clearing works — the key is deleted rather than left as an empty object, so
       * `readOrgBranding` stays a plain existence check.
       */
      const branding = patch.branding === null ? undefined : parseOrgBranding(patch.branding);
      const settings = { ...(org.settings ?? {}) };
      if (branding) settings.branding = branding;
      else delete settings.branding;
      org.settings = settings;
    }

    return this.repo.save(org);
  }

  /** SuperAdmin suspend/activate (#62). Caller must reload OrganizationCache after. */
  async setStatus(id: string, status: OrganizationStatus): Promise<Organization> {
    const org = await this.getById(id);
    org.status = status;
    return this.repo.save(org);
  }

  /** Normalize a name/slug to the canonical url-safe form. */
  slugify(base: string): string {
    return (
      base
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'org' // 80 = the organizations.slug column limit
    );
  }
}
// NOTE: there is exactly ONE way a tenant comes into existence —
// `POST /platform/organizations`, which is @Platform-gated to a SuperAdmin.
//
// The retired third-party identity webhook was a second way, and it was an
// escalation: a verified signature proves an event came from the provider, never
// that whoever acted was authorised. So any user who created an organization
// there had a local tenant minted for them, and the membership handler then
// stamped them its ADMIN — detaching them from their real tenant. Deleting that
// path is what closes it. Nothing may reintroduce a second creation path, and in
// particular nothing may adopt a tenant by SLUG: the legacy tenant holds every
// non-superadmin, so a name chosen to slugify onto it would bind to the real one.
