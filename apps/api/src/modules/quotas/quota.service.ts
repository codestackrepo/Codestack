import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { OrgInviteStatus } from '../invites/enums/org-invite.enums';
import { ALL_QUOTA_RESOURCES, QuotaResource } from './enums/quota-resource.enum';
import { QuotaExceededException } from './quota-exceeded.exception';

/** One resource's limit and live usage. `limit === null` means unlimited. */
export interface QuotaUsage {
  used: number;
  limit: number | null;
}

export type QuotaUsageSummary = Record<QuotaResource, QuotaUsage>;

/**
 * The authoritative quota primitive (#66, §5.4).
 *
 * `assertWithinQuota` MUST be called INSIDE the caller's create transaction, with
 * that transaction's `manager`. It takes a row lock on the org's quota row, so two
 * concurrent creates against a limit of N can never both pass at N-1 — outside a
 * transaction the lock would be released immediately and the check would be a
 * suggestion rather than an invariant.
 *
 * NULL vs 0 is centralised here and nowhere else: no row / `limit_value IS NULL`
 * means UNLIMITED, and `0` means BLOCKED. `?? 0` anywhere in this file would
 * silently convert every unlimited org into a blocked one.
 *
 * The unlimited path costs ONE indexed lookup and NO count — that is the common
 * case for every tenant without a cap, so it must stay cheap.
 */
@Injectable()
export class QuotaService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Throws QuotaExceededException (409) when `addCount` more of `resource` would
   * exceed the org's limit. A no-op when the actor has no org (SuperAdmin, and
   * global content, are never charged) or the org has no limit for the resource.
   */
  async assertWithinQuota(
    orgId: string | null,
    resource: QuotaResource,
    addCount: number,
    manager: EntityManager,
  ): Promise<void> {
    if (!orgId) return; // platform-scoped work is never charged to a tenant
    if (addCount <= 0) return;

    const limit = await this.lockLimit(orgId, resource, manager);
    if (limit === null) return; // unlimited — deliberately no COUNT on this path

    const current = await this.countUsage(orgId, resource, manager);
    if (current + addCount > limit) {
      throw new QuotaExceededException({ resource, limit, current, attempted: addCount });
    }
  }

  /**
   * Pre-flight for bulk work (CSV import, #68): how many more of `resource` fit.
   * `null` means unlimited. Advisory only — it takes NO lock, so the authoritative
   * check is still `assertWithinQuota` inside the transaction that does the work.
   */
  async checkHeadroom(orgId: string | null, resource: QuotaResource): Promise<number | null> {
    if (!orgId) return null;
    const usage = await this.usageFor(orgId, resource, this.dataSource.manager);
    if (usage.limit === null) return null;
    return Math.max(0, usage.limit - usage.used);
  }

  /**
   * Limits + live usage for every resource — consumed by the platform org detail
   * (#63) and the org-admin overview. Read-only and lock-free.
   */
  async getUsageSummary(orgId: string): Promise<QuotaUsageSummary> {
    const entries = await Promise.all(
      ALL_QUOTA_RESOURCES.map(
        async (resource) =>
          [resource, await this.usageFor(orgId, resource, this.dataSource.manager)] as const,
      ),
    );
    return Object.fromEntries(entries) as QuotaUsageSummary;
  }

  /** SuperAdmin: set (or clear) one org's limit. `null` = unlimited, `0` = blocked. */
  async setLimit(orgId: string, resource: QuotaResource, limitValue: number | null): Promise<void> {
    if (limitValue !== null && (!Number.isInteger(limitValue) || limitValue < 0)) {
      throw new BadRequestException('limitValue must be a non-negative integer or null');
    }
    // ON CONFLICT keeps this idempotent and race-safe against a concurrent setter,
    // rather than a read-then-write that can lose one of two updates.
    await this.dataSource.query(
      `INSERT INTO org_quotas (organization_id, resource, limit_value)
            VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, resource)
       DO UPDATE SET limit_value = EXCLUDED.limit_value, updated_at = now()`,
      [orgId, resource, limitValue],
    );
  }

  /** Read one resource's limit + usage without locking. */
  private async usageFor(
    orgId: string,
    resource: QuotaResource,
    manager: EntityManager,
  ): Promise<QuotaUsage> {
    const [limit, used] = await Promise.all([
      this.readLimit(orgId, resource, manager, false),
      this.countUsage(orgId, resource, manager),
    ]);
    return { used, limit };
  }

  /** `SELECT … FOR UPDATE` the quota row — serialises concurrent creates. */
  private lockLimit(
    orgId: string,
    resource: QuotaResource,
    manager: EntityManager,
  ): Promise<number | null> {
    return this.readLimit(orgId, resource, manager, true);
  }

  private async readLimit(
    orgId: string,
    resource: QuotaResource,
    manager: EntityManager,
    lock: boolean,
  ): Promise<number | null> {
    const rows = await manager.query<{ limit_value: number | string | null }[]>(
      `SELECT limit_value FROM org_quotas WHERE organization_id = $1 AND resource = $2` +
        (lock ? ' FOR UPDATE' : ''),
      [orgId, resource],
    );
    // No row at all => unlimited. NOTE: FOR UPDATE on a missing row locks nothing,
    // which is correct here — with no cap there is nothing to serialise.
    if (!rows.length) return null;
    const raw = rows[0].limit_value;
    return raw === null ? null : Number(raw); // 0 stays 0: blocked, NOT unlimited
  }

  /**
   * Live indexed COUNT per §5.4 — no denormalised counters, which drift. Every
   * count runs on `manager`, so inside a transaction it sees that transaction's
   * own uncommitted rows and a two-step create can't double-spend a seat.
   */
  private async countUsage(
    orgId: string,
    resource: QuotaResource,
    manager: EntityManager,
  ): Promise<number> {
    switch (resource) {
      case QuotaResource.MAX_USERS:
        return this.countSeats(orgId, manager);
      case QuotaResource.MAX_PROBLEMS:
        // organization_id IS NOT NULL <=> scope='org' (chk_problem_scope_org), so
        // this naturally excludes the global catalog: it is charged to no tenant.
        return this.countRows('problems', orgId, manager);
      case QuotaResource.MAX_ASSIGNMENTS:
        return this.countRows('assignments', orgId, manager);
    }
  }

  /**
   * Seats = ACTIVE members + PENDING, NON-EXPIRED invites (§5.4). Reserving a
   * seat at invite time is what makes acceptance net-zero (invite pending->accepted
   * -1, user +1), so an org can't be oversubscribed by minting invites.
   *
   * The `expires_at > now()` term matters because `expired` is a STORED status
   * flipped lazily (1785530000000) — a timed-out invite can sit as `pending` until
   * someone touches that address again, and without this predicate it would hold a
   * seat forever. `PlatformMetricsService.census()` applies the IDENTICAL predicate;
   * the two must move together or the console and enforcement disagree about how
   * full an org is.
   */
  private async countSeats(orgId: string, manager: EntityManager): Promise<number> {
    const rows = await manager.query<{ count: string }[]>(
      `SELECT (
         (SELECT COUNT(*) FROM users
           WHERE organization_id = $1 AND is_active = true)
         +
         (SELECT COUNT(*) FROM org_invites
           WHERE organization_id = $1 AND status = $2 AND expires_at > now())
       ) AS count`,
      [orgId, OrgInviteStatus.PENDING],
    );
    return Number(rows[0]?.count ?? 0);
  }

  private async countRows(
    table: 'problems' | 'assignments',
    orgId: string,
    manager: EntityManager,
  ): Promise<number> {
    // `table` is a closed union, never caller input — no interpolation risk.
    const rows = await manager.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM ${table} WHERE organization_id = $1`,
      [orgId],
    );
    return Number(rows[0]?.count ?? 0);
  }
}
