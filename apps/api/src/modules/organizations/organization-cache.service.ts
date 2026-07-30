import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './entities/organization.entity';
import { OrganizationStatus } from './enums/organization.enums';

/** How long to wait between boot-time reload retries while the DB isn't ready. */
const RELOAD_RETRY_MS = 15_000;

/**
 * In-memory {orgId -> status} cache — mirrors ModuleAccessService's
 * single-instance map, rebuilt on write. Lets the TenantContextGuard (#51) check
 * active/suspended without a per-request DB hit.
 *
 * Single-instance only for now; cross-instance Redis pub/sub invalidation rides
 * in with the module-access hierarchy work (#64) that adds the same channel.
 *
 * Boot-safe: the initial load happens off the bootstrap path. If the DB isn't
 * reachable or the `organizations` table doesn't exist yet (e.g. migrations
 * haven't run on a fresh deploy), we start with an empty map and retry in the
 * background instead of throwing out of onModuleInit — a required DB read there
 * would abort Nest bootstrap and take the whole HTTP server (and health check)
 * down. An empty map is safe: the guard treats unknown orgs as not-suspended.
 */
@Injectable()
export class OrganizationCache implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrganizationCache.name);
  private status = new Map<string, OrganizationStatus>();
  private retryTimer?: NodeJS.Timeout;

  constructor(@InjectRepository(Organization) private readonly repo: Repository<Organization>) {}

  onModuleInit(): void {
    // Fire-and-forget: never block bootstrap on this read.
    void this.warm();
  }

  onModuleDestroy(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  /** Attempt an initial load; on failure, log and schedule a background retry. */
  private async warm(): Promise<void> {
    try {
      await this.reload();
      this.logger.log(`Organization status cache loaded (${this.status.size} orgs)`);
    } catch (err) {
      this.logger.warn(
        `Organization status cache load failed; serving empty cache and retrying in ` +
          `${RELOAD_RETRY_MS}ms: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.retryTimer = setTimeout(() => void this.warm(), RELOAD_RETRY_MS);
      if (this.retryTimer.unref) this.retryTimer.unref();
    }
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
