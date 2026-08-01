import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ALL_QUOTA_RESOURCES, QuotaResource } from './enums/quota-resource.enum';
import { QuotaExceededException } from './quota-exceeded.exception';
import { QuotaService } from './quota.service';

const ORG = 'org-A';

/**
 * A manager stub that answers the two SQL shapes the service issues: the quota-row
 * lookup and a COUNT. Records every statement so the lock (`FOR UPDATE`) and the
 * "no COUNT on the unlimited path" guarantee can both be asserted.
 */
function makeManager(opts: { limit?: number | null; rowExists?: boolean; count?: number } = {}) {
  const sql: string[] = [];
  const manager = {
    query: jest.fn(async (text: string) => {
      sql.push(text.replace(/\s+/g, ' ').trim());
      if (text.includes('FROM org_quotas')) {
        return opts.rowExists === false ? [] : [{ limit_value: opts.limit ?? null }];
      }
      // Both the seat sub-select form and the plain COUNT form return one row.
      return [{ count: String(opts.count ?? 0) }];
    }),
  };
  return { manager: manager as unknown as EntityManager, sql, query: manager.query };
}

function makeService(dsOverrides: Record<string, unknown> = {}) {
  const managerBag = makeManager({ limit: null });
  const dataSource = {
    manager: managerBag.manager,
    query: jest.fn().mockResolvedValue([]),
    ...dsOverrides,
  };
  return { service: new QuotaService(dataSource as never), dataSource, managerBag };
}

describe('QuotaService.assertWithinQuota', () => {
  it('is a no-op with no org — platform work is never charged to a tenant', async () => {
    const { service } = makeService();
    const { manager, query } = makeManager();
    await service.assertWithinQuota(null, QuotaResource.MAX_PROBLEMS, 1, manager);
    expect(query).not.toHaveBeenCalled();
  });

  it('is a no-op for addCount <= 0', async () => {
    const { service } = makeService();
    const { manager, query } = makeManager();
    await service.assertWithinQuota(ORG, QuotaResource.MAX_USERS, 0, manager);
    expect(query).not.toHaveBeenCalled();
  });

  it('no quota row => unlimited, and deliberately NO count query', async () => {
    const { service } = makeService();
    const { manager, sql } = makeManager({ rowExists: false });
    await service.assertWithinQuota(ORG, QuotaResource.MAX_USERS, 5, manager);
    expect(sql).toHaveLength(1); // the lookup only — the free path must stay cheap
    expect(sql[0]).toContain('FROM org_quotas');
    expect(sql.some((s) => s.includes('COUNT('))).toBe(false);
  });

  it('limit_value NULL => unlimited, and no count', async () => {
    const { service } = makeService();
    const { manager, sql } = makeManager({ limit: null });
    await service.assertWithinQuota(ORG, QuotaResource.MAX_USERS, 100, manager);
    expect(sql.some((s) => s.includes('COUNT('))).toBe(false);
  });

  it('locks the quota row FOR UPDATE so concurrent creates serialise', async () => {
    const { service } = makeService();
    const { manager, sql } = makeManager({ limit: 10, count: 1 });
    await service.assertWithinQuota(ORG, QuotaResource.MAX_USERS, 1, manager);
    expect(sql[0]).toContain('FOR UPDATE');
  });

  it('allows up to exactly the limit', async () => {
    const { service } = makeService();
    const { manager } = makeManager({ limit: 10, count: 9 });
    await expect(
      service.assertWithinQuota(ORG, QuotaResource.MAX_USERS, 1, manager),
    ).resolves.toBeUndefined();
  });

  it('throws 409 with the numbers when one more would exceed', async () => {
    const { service } = makeService();
    const { manager } = makeManager({ limit: 10, count: 10 });
    const err = await service
      .assertWithinQuota(ORG, QuotaResource.MAX_USERS, 1, manager)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QuotaExceededException);
    expect((err as QuotaExceededException).getStatus()).toBe(409);
    expect((err as QuotaExceededException).getResponse()).toEqual({
      reason: 'quota_exceeded',
      resource: QuotaResource.MAX_USERS,
      limit: 10,
      current: 10,
      attempted: 1,
      wouldBe: 11,
    });
  });

  it('rejects a bulk add that would overshoot, even though one would fit', async () => {
    const { service } = makeService();
    const { manager } = makeManager({ limit: 10, count: 9 });
    await expect(
      service.assertWithinQuota(ORG, QuotaResource.MAX_USERS, 3, manager),
    ).rejects.toMatchObject({ response: { current: 9, attempted: 3, wouldBe: 12 } });
  });

  it('limit 0 BLOCKS everything and is never read as unlimited', async () => {
    const { service } = makeService();
    const { manager } = makeManager({ limit: 0, count: 0 });
    await expect(
      service.assertWithinQuota(ORG, QuotaResource.MAX_PROBLEMS, 1, manager),
    ).rejects.toMatchObject({ response: { limit: 0, wouldBe: 1 } });
  });

  it('counts MAX_USERS as active members + PENDING invites (seat reservation)', async () => {
    const { service } = makeService();
    const { manager, sql } = makeManager({ limit: 10, count: 4 });
    await service.assertWithinQuota(ORG, QuotaResource.MAX_USERS, 1, manager);
    const count = sql.find((s) => s.includes('COUNT('))!;
    expect(count).toContain('FROM users');
    expect(count).toContain('is_active = true');
    expect(count).toContain('FROM org_invites');
    expect(count).toContain('status =');
  });

  // `expired` is a STORED status flipped lazily (1785530000000), so a timed-out
  // invite can still read as 'pending'. Without this term it would hold a seat
  // forever, and PlatformMetricsService.census() applies the identical predicate —
  // if these two ever diverge the console and enforcement disagree about how full
  // an org is.
  it('excludes EXPIRED-but-still-pending invites from the seat count', async () => {
    const { service } = makeService();
    const { manager, sql } = makeManager({ limit: 10, count: 4 });
    await service.assertWithinQuota(ORG, QuotaResource.MAX_USERS, 1, manager);
    const count = sql.find((s) => s.includes('FROM org_invites'))!;
    expect(count).toContain('expires_at > now()');
  });

  it('counts problems/assignments by organization_id (so the global catalog is exempt)', async () => {
    const { service } = makeService();
    for (const [resource, table] of [
      [QuotaResource.MAX_PROBLEMS, 'FROM problems'],
      [QuotaResource.MAX_ASSIGNMENTS, 'FROM assignments'],
    ] as const) {
      const { manager, sql } = makeManager({ limit: 10, count: 1 });
      await service.assertWithinQuota(ORG, resource, 1, manager);
      const count = sql.find((s) => s.includes('COUNT('))!;
      expect(count).toContain(table);
      expect(count).toContain('organization_id = $1');
    }
  });

  it("runs every statement on the CALLER's manager, never its own connection", async () => {
    const { service, dataSource } = makeService();
    const { manager, query } = makeManager({ limit: 5, count: 1 });
    await service.assertWithinQuota(ORG, QuotaResource.MAX_USERS, 1, manager);
    expect(query).toHaveBeenCalled();
    // A lock taken on another connection would be released immediately, making
    // the whole check advisory — so the DataSource must not be touched here.
    expect(dataSource.query).not.toHaveBeenCalled();
  });
});

describe('QuotaService.getUsageSummary', () => {
  it('reports used + limit for every resource, without locking', async () => {
    const managerBag = makeManager({ limit: 7, count: 3 });
    const { service } = makeService({ manager: managerBag.manager });
    const summary = await service.getUsageSummary(ORG);
    // Derived from ALL_QUOTA_RESOURCES rather than listed, so adding a resource
    // extends the summary without this assertion having to be remembered. The two
    // per-role seat caps (#118) arrived exactly that way.
    expect(Object.keys(summary).sort()).toEqual([...ALL_QUOTA_RESOURCES].sort());
    expect(Object.keys(summary)).toContain(QuotaResource.MAX_PROFESSORS);
    expect(Object.keys(summary)).toContain(QuotaResource.MAX_STUDENTS);
    expect(summary[QuotaResource.MAX_USERS]).toEqual({ used: 3, limit: 7 });
    expect(managerBag.sql.some((s) => s.includes('FOR UPDATE'))).toBe(false);
  });

  it('reports limit null for an org with no quota rows', async () => {
    const managerBag = makeManager({ rowExists: false, count: 2 });
    const { service } = makeService({ manager: managerBag.manager });
    const summary = await service.getUsageSummary(ORG);
    expect(summary[QuotaResource.MAX_PROBLEMS]).toEqual({ used: 2, limit: null });
  });
});

describe('QuotaService.checkHeadroom', () => {
  it('returns the remaining allowance, floored at 0', async () => {
    const { service } = makeService({ manager: makeManager({ limit: 10, count: 8 }).manager });
    await expect(service.checkHeadroom(ORG, QuotaResource.MAX_USERS)).resolves.toBe(2);

    const over = makeService({ manager: makeManager({ limit: 5, count: 9 }).manager });
    await expect(over.service.checkHeadroom(ORG, QuotaResource.MAX_USERS)).resolves.toBe(0);
  });

  it('returns null (unlimited) with no limit, and for no org', async () => {
    const { service } = makeService({ manager: makeManager({ limit: null, count: 3 }).manager });
    await expect(service.checkHeadroom(ORG, QuotaResource.MAX_USERS)).resolves.toBeNull();
    await expect(service.checkHeadroom(null, QuotaResource.MAX_USERS)).resolves.toBeNull();
  });
});

describe('QuotaService.setLimit', () => {
  it('upserts so a repeat set cannot lose a concurrent write', async () => {
    const { service, dataSource } = makeService();
    await service.setLimit(ORG, QuotaResource.MAX_USERS, 25);
    const [sql, params] = (dataSource.query as jest.Mock).mock.calls[0];
    expect(sql).toContain('ON CONFLICT');
    expect(params).toEqual([ORG, QuotaResource.MAX_USERS, 25]);
  });

  it('accepts null (unlimited) and 0 (blocked)', async () => {
    const { service, dataSource } = makeService();
    await service.setLimit(ORG, QuotaResource.MAX_USERS, null);
    await service.setLimit(ORG, QuotaResource.MAX_PROBLEMS, 0);
    const calls = (dataSource.query as jest.Mock).mock.calls;
    expect(calls[0][1][2]).toBeNull();
    expect(calls[1][1][2]).toBe(0);
  });

  it('rejects a negative or fractional limit', async () => {
    const { service } = makeService();
    await expect(service.setLimit(ORG, QuotaResource.MAX_USERS, -1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.setLimit(ORG, QuotaResource.MAX_USERS, 1.5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
