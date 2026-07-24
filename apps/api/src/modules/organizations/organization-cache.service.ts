import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './entities/organization.entity';
import { OrganizationStatus } from './enums/organization.enums';

/**
 * In-memory {orgId -> status} cache — mirrors ModuleAccessService's
 * single-instance map, rebuilt on write. Lets the TenantContextGuard (#51) check
 * active/suspended without a per-request DB hit.
 *
 * Single-instance only for now; cross-instance Redis pub/sub invalidation rides
 * in with the module-access hierarchy work (#64) that adds the same channel.
 */
@Injectable()
export class OrganizationCache implements OnModuleInit {
  private status = new Map<string, OrganizationStatus>();

  constructor(
    @InjectRepository(Organization) private readonly repo: Repository<Organization>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  /** Rebuild the map from the DB (call after any org status write). */
  async reload(): Promise<void> {
    const rows = await this.repo.find({ select: { id: true, status: true } });
    const next = new Map<string, OrganizationStatus>();
    for (const r of rows) next.set(r.id, r.status);
    this.status = next;
  }

  /** Status for an org, or undefined if unknown (guard treats unknown as not-suspended). */
  getStatus(orgId: string): OrganizationStatus | undefined {
    return this.status.get(orgId);
  }
}
