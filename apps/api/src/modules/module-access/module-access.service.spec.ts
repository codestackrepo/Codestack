import { BadRequestException } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';
import { ModuleAccess } from './entities/module-access.entity';
import { OrgModuleGrant } from './entities/org-module-grant.entity';
import { AppModuleKey, SYSTEM_MODULES, TOGGLEABLE_MODULES } from './enums/app-module-key.enum';
import { ALL_FEATURES, FeatureKey } from './enums/feature-key.enum';
import { ModuleAccessService } from './module-access.service';

type Rows = Partial<ModuleAccess>[];
type Grants = Partial<OrgModuleGrant>[];

const ORG = 'org-A';

/** Matches TypeORM semantics closely enough: IsNull() vs a literal org id. */
function orgMatches(row: Partial<ModuleAccess>, where: unknown): boolean {
  const wanted = (where as { orgId?: unknown }).orgId;
  const isNullOp = typeof wanted === 'object' && wanted !== null;
  return isNullOp ? (row.orgId ?? null) === null : (row.orgId ?? null) === wanted;
}

function makeService(initial: Rows = [], grants: Grants = []) {
  let rows: Rows = [...initial];
  let grantRows: Grants = [...grants];

  const repo = {
    find: jest.fn(async ({ where }: { where: unknown }) =>
      rows.filter((r) => orgMatches(r, where)),
    ),
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      rows.find(
        (r) => r.moduleKey === where.moduleKey && r.role === where.role && orgMatches(r, where),
      ),
    ),
    create: jest.fn((d: Partial<ModuleAccess>) => d),
    save: jest.fn(async (d: Partial<ModuleAccess>) => {
      const idx = rows.findIndex(
        (r) =>
          r.moduleKey === d.moduleKey &&
          r.role === d.role &&
          (r.orgId ?? null) === (d.orgId ?? null),
      );
      if (idx >= 0) rows[idx] = { ...rows[idx], ...d };
      else rows.push(d);
      return d;
    }),
  };

  const grantRepo = {
    find: jest.fn(async ({ where }: { where: { organizationId: string } }) =>
      grantRows.filter((g) => g.organizationId === where.organizationId),
    ),
    findOne: jest.fn(async ({ where }: { where: { organizationId: string; featureKey: string } }) =>
      grantRows.find(
        (g) => g.organizationId === where.organizationId && g.featureKey === where.featureKey,
      ),
    ),
    create: jest.fn((d: Partial<OrgModuleGrant>) => d),
    save: jest.fn(async (d: Partial<OrgModuleGrant>) => {
      const idx = grantRows.findIndex(
        (g) => g.organizationId === d.organizationId && g.featureKey === d.featureKey,
      );
      if (idx >= 0) grantRows[idx] = { ...grantRows[idx], ...d };
      else grantRows.push(d);
      return d;
    }),
  };

  const service = new ModuleAccessService(repo as never, grantRepo as never);
  return {
    service,
    repo,
    grantRepo,
    setRows: (r: Rows) => (rows = [...r]),
    setGrants: (g: Grants) => (grantRows = [...g]),
  };
}

// ------------------------------------------------------------------ modules

describe('ModuleAccessService — module resolution', () => {
  it('layer 0: SUPERADMIN passes even a revoked grant (the sole unconditional bypass)', async () => {
    const { service } = makeService(
      [],
      [{ organizationId: ORG, featureKey: AppModuleKey.PROBLEMS, granted: false }],
    );
    await service.reload();
    expect(await service.isEnabled(AppModuleKey.PROBLEMS, Role.SUPERADMIN, ORG)).toBe(true);
  });

  it('layer 1: SYSTEM modules are on even with an override saying otherwise', async () => {
    const { service } = makeService([
      { moduleKey: AppModuleKey.DASHBOARD, role: Role.STUDENT, enabled: false, orgId: null },
    ]);
    await service.reload();
    expect(await service.isEnabled(AppModuleKey.DASHBOARD, Role.STUDENT, ORG)).toBe(true);
  });

  it('layer 2 beats layer 3: a revoked grant gates the org ADMIN too', async () => {
    const { service } = makeService(
      [],
      [{ organizationId: ORG, featureKey: AppModuleKey.PROBLEMS, granted: false }],
    );
    await service.reload();
    // This is the whole point of removing admin's unconditional bypass.
    expect(await service.isEnabled(AppModuleKey.PROBLEMS, Role.ADMIN, ORG)).toBe(false);
    expect(await service.isEnabled(AppModuleKey.PROBLEMS, Role.PROFESSOR, ORG)).toBe(false);
  });

  it('layer 3: an override can never lock an ADMIN out of its own org', async () => {
    const { service } = makeService([
      { moduleKey: AppModuleKey.PROBLEMS, role: Role.ADMIN, enabled: false, orgId: ORG },
      { moduleKey: AppModuleKey.PROBLEMS, role: Role.ADMIN, enabled: false, orgId: null },
    ]);
    await service.reload();
    expect(await service.isEnabled(AppModuleKey.PROBLEMS, Role.ADMIN, ORG)).toBe(true);
  });

  it('layer 5 beats layer 6: the org override wins over the platform override', async () => {
    const { service } = makeService([
      { moduleKey: AppModuleKey.PLAYGROUND, role: Role.STUDENT, enabled: false, orgId: null },
      { moduleKey: AppModuleKey.PLAYGROUND, role: Role.STUDENT, enabled: true, orgId: ORG },
    ]);
    await service.reload();
    expect(await service.isEnabled(AppModuleKey.PLAYGROUND, Role.STUDENT, ORG)).toBe(true);
    // A different org sees only the platform layer.
    expect(await service.isEnabled(AppModuleKey.PLAYGROUND, Role.STUDENT, 'org-B')).toBe(false);
  });

  it('layer 6 beats layer 7: a platform override wins over an org role_default', async () => {
    const { service } = makeService(
      [{ moduleKey: AppModuleKey.PLAYGROUND, role: Role.STUDENT, enabled: false, orgId: null }],
      [
        {
          organizationId: ORG,
          featureKey: AppModuleKey.PLAYGROUND,
          granted: true,
          roleDefaults: { [Role.STUDENT]: true },
        },
      ],
    );
    await service.reload();
    expect(await service.isEnabled(AppModuleKey.PLAYGROUND, Role.STUDENT, ORG)).toBe(false);
  });

  it('layer 7 beats layer 8: an org role_default wins over the code DEFAULT', async () => {
    const { service } = makeService(
      [],
      [
        {
          organizationId: ORG,
          featureKey: AppModuleKey.GRADING,
          granted: true,
          roleDefaults: { [Role.STUDENT]: true },
        },
      ],
    );
    await service.reload();
    // GRADING defaults to false for students in code.
    expect(await service.isEnabled(AppModuleKey.GRADING, Role.STUDENT, ORG)).toBe(true);
    expect(await service.isEnabled(AppModuleKey.GRADING, Role.STUDENT, 'org-B')).toBe(false);
  });

  it('layer 8: falls back to the code DEFAULT with nothing configured', async () => {
    const { service } = makeService();
    await service.reload();
    expect(await service.isEnabled(AppModuleKey.GRADING, Role.STUDENT, ORG)).toBe(false);
    expect(await service.isEnabled(AppModuleKey.PROBLEMS, Role.STUDENT, ORG)).toBe(true);
  });

  it('a grant row written only for role_defaults does NOT revoke (granted defaults true)', async () => {
    const { service } = makeService(
      [],
      [
        {
          organizationId: ORG,
          featureKey: AppModuleKey.PROBLEMS,
          granted: true,
          roleDefaults: { [Role.STUDENT]: false },
        },
      ],
    );
    await service.reload();
    expect(await service.isEnabled(AppModuleKey.PROBLEMS, Role.PROFESSOR, ORG)).toBe(true);
    expect(await service.isEnabled(AppModuleKey.PROBLEMS, Role.STUDENT, ORG)).toBe(false);
  });
});

// ----------------------------------------------------------------- features

describe('ModuleAccessService — feature resolution', () => {
  it('a feature dies with its module', async () => {
    const { service } = makeService(
      [],
      [{ organizationId: ORG, featureKey: AppModuleKey.PROBLEMS, granted: false }],
    );
    await service.reload();
    expect(await service.isEnabled(FeatureKey.PROBLEMS_AUTHOR, Role.PROFESSOR, ORG)).toBe(false);
  });

  it('layer 4: the role ceiling is non-overridable for a student', async () => {
    const { service } = makeService([
      // Someone tried to hand students authoring at both override layers.
      { moduleKey: FeatureKey.PROBLEMS_AUTHOR, role: Role.STUDENT, enabled: true, orgId: ORG },
      { moduleKey: FeatureKey.PROBLEMS_AUTHOR, role: Role.STUDENT, enabled: true, orgId: null },
    ]);
    await service.reload();
    expect(await service.isEnabled(FeatureKey.PROBLEMS_AUTHOR, Role.STUDENT, ORG)).toBe(false);
    expect(await service.isEnabled(FeatureKey.GRADING_PUBLISH, Role.STUDENT, ORG)).toBe(false);
  });

  it('layer 4 beats layer 3: an empty ceiling keeps problems.global SuperAdmin-only', async () => {
    const { service } = makeService();
    await service.reload();
    // The ordering deviation from the plan's table exists precisely for this: with
    // admin immunity above the ceiling, an org admin would author the global catalog.
    expect(await service.isEnabled(FeatureKey.PROBLEMS_GLOBAL, Role.ADMIN, ORG)).toBe(false);
    expect(await service.isEnabled(FeatureKey.PROBLEMS_GLOBAL, Role.PROFESSOR, ORG)).toBe(false);
    expect(await service.isEnabled(FeatureKey.PROBLEMS_GLOBAL, Role.SUPERADMIN, null)).toBe(true);
  });

  /*
   * #69 registered the `league` module, and that CHANGED this answer for an ADMIN.
   *
   * Before, `league.host` failed closed for everyone because `featureModule` returned
   * undefined for an unregistered prefix. Now the prefix resolves, and
   * `resolveFeature` short-circuits `role === ADMIN` to true BEFORE it reads
   * FEATURE_DEFAULTS — so an org admin holds `league.host` even though its default is
   * off. Admin immunity outranks every layer except a platform GRANT.
   *
   * That is inert today: no route carries `@RequiresFeature(LEAGUE_HOST)`, so nothing
   * is reachable through it. It is recorded here because #78 will build on this key
   * and must not assume it is universally denied.
   */
  it('league.host stays closed for professor and student after #69', async () => {
    const { service } = makeService();
    await service.reload();
    for (const role of [Role.PROFESSOR, Role.STUDENT]) {
      expect(await service.isEnabled(FeatureKey.LEAGUE_HOST, role, ORG)).toBe(false);
    }
    // Admin immunity, not an entitlement decision — see the comment above.
    expect(await service.isEnabled(FeatureKey.LEAGUE_HOST, Role.ADMIN, ORG)).toBe(true);
    // SuperAdmin bypasses at layer 0.
    expect(await service.isEnabled(FeatureKey.LEAGUE_HOST, Role.SUPERADMIN, null)).toBe(true);
  });

  it('the reserved league MODULE stays off for professor and student', async () => {
    const { service } = makeService();
    await service.reload();
    for (const role of [Role.PROFESSOR, Role.STUDENT]) {
      expect(await service.isEnabled(AppModuleKey.LEAGUE, role, ORG)).toBe(false);
    }
  });

  it('student-facing features have no ceiling and default on', async () => {
    const { service } = makeService();
    await service.reload();
    expect(await service.isEnabled(FeatureKey.PROBLEMS_FEEDBACK, Role.STUDENT, ORG)).toBe(true);
    expect(await service.isEnabled(FeatureKey.TOPICS_COMMENT, Role.STUDENT, ORG)).toBe(true);
  });

  it('a feature can be revoked per-org without touching its module', async () => {
    const { service } = makeService(
      [],
      [{ organizationId: ORG, featureKey: FeatureKey.ASSIGNMENTS_AUTHOR, granted: false }],
    );
    await service.reload();
    expect(await service.isEnabled(AppModuleKey.ASSIGNMENTS, Role.PROFESSOR, ORG)).toBe(true);
    expect(await service.isEnabled(FeatureKey.ASSIGNMENTS_AUTHOR, Role.PROFESSOR, ORG)).toBe(false);
    // ...and it binds the admin too (layer 2 outranks immunity).
    expect(await service.isEnabled(FeatureKey.ASSIGNMENTS_AUTHOR, Role.ADMIN, ORG)).toBe(false);
  });
});

// -------------------------------------------------------------------- maps

describe('ModuleAccessService — effective maps', () => {
  it('effectiveMapForRole resolves toggleables and forces SYSTEM keys on', async () => {
    const { service } = makeService();
    await service.reload();
    const map = await service.effectiveMapForRole(Role.STUDENT, ORG);
    for (const k of TOGGLEABLE_MODULES) expect(typeof map[k]).toBe('boolean');
    for (const k of SYSTEM_MODULES) expect(map[k]).toBe(true);
    expect(map[AppModuleKey.GRADING]).toBe(false);
    expect(map[AppModuleKey.PROBLEMS]).toBe(true);
  });

  it('effectiveFeatureMap covers every feature key', async () => {
    const { service } = makeService();
    await service.reload();
    const map = await service.effectiveFeatureMap(Role.PROFESSOR, ORG);
    expect(Object.keys(map).sort()).toEqual([...ALL_FEATURES].sort());
    expect(map[FeatureKey.ASSIGNMENTS_AUTHOR]).toBe(true);
    expect(map[FeatureKey.PROBLEMS_GLOBAL]).toBe(false);
  });

  it('getMatrix marks ceiling-blocked feature cells locked', async () => {
    const { service } = makeService();
    await service.reload();
    const matrix = await service.getMatrix(ORG);
    expect(matrix).toHaveLength((TOGGLEABLE_MODULES.length + ALL_FEATURES.length) * 3);
    const studentAuthor = matrix.find(
      (c) => c.moduleKey === FeatureKey.PROBLEMS_AUTHOR && c.role === Role.STUDENT,
    );
    expect(studentAuthor).toEqual(expect.objectContaining({ enabled: false, locked: true }));
    for (const c of matrix.filter((c) => c.role === Role.ADMIN)) expect(c.locked).toBe(true);
  });
});

// ------------------------------------------------------------------ writes

describe('ModuleAccessService.setCell', () => {
  it('writes the ORG layer and takes effect immediately', async () => {
    const { service } = makeService();
    await service.reload();
    await service.setCell(AppModuleKey.PROBLEMS, Role.STUDENT, false, ORG);
    expect(await service.isEnabled(AppModuleKey.PROBLEMS, Role.STUDENT, ORG)).toBe(false);
    // ...and leaves other orgs alone.
    expect(await service.isEnabled(AppModuleKey.PROBLEMS, Role.STUDENT, 'org-B')).toBe(true);
  });

  it('writes the PLATFORM layer when orgId is null, affecting every org', async () => {
    const { service } = makeService();
    await service.reload();
    await service.setCell(AppModuleKey.PROBLEMS, Role.STUDENT, false, null);
    expect(await service.isEnabled(AppModuleKey.PROBLEMS, Role.STUDENT, ORG)).toBe(false);
    expect(await service.isEnabled(AppModuleKey.PROBLEMS, Role.STUDENT, 'org-B')).toBe(false);
  });

  it('upserts rather than duplicating the platform row on a repeat write', async () => {
    const { service, repo } = makeService();
    await service.reload();
    await service.setCell(AppModuleKey.PROBLEMS, Role.STUDENT, false, null);
    await service.setCell(AppModuleKey.PROBLEMS, Role.STUDENT, true, null);
    expect(repo.create).toHaveBeenCalledTimes(1); // second write found the row
    expect(await service.isEnabled(AppModuleKey.PROBLEMS, Role.STUDENT, ORG)).toBe(true);
  });

  it('rejects a SYSTEM key, role=admin, and a ceiling-forbidden feature cell', async () => {
    const { service } = makeService();
    await expect(service.setCell('dashboard', Role.STUDENT, false, ORG)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.setCell('problems', Role.ADMIN, false, ORG)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.setCell(FeatureKey.PROBLEMS_AUTHOR, Role.STUDENT, true, ORG),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts a valid dotted feature cell', async () => {
    const { service } = makeService();
    await service.reload();
    await service.setCell(FeatureKey.ASSIGNMENTS_AUTHOR, Role.PROFESSOR, false, ORG);
    expect(await service.isEnabled(FeatureKey.ASSIGNMENTS_AUTHOR, Role.PROFESSOR, ORG)).toBe(false);
  });
});

describe('ModuleAccessService.setGrant', () => {
  it('revokes for the whole org and takes effect immediately', async () => {
    const { service } = makeService();
    await service.reload();
    await service.setGrant(ORG, AppModuleKey.PROBLEMS, { granted: false });
    expect(await service.isEnabled(AppModuleKey.PROBLEMS, Role.ADMIN, ORG)).toBe(false);
  });

  it('setting only roleDefaults leaves granted true', async () => {
    const { service, grantRepo } = makeService();
    await service.reload();
    await service.setGrant(ORG, AppModuleKey.GRADING, { roleDefaults: { [Role.STUDENT]: true } });
    expect(grantRepo.save).toHaveBeenCalledWith(expect.objectContaining({ granted: true }));
    expect(await service.isEnabled(AppModuleKey.GRADING, Role.STUDENT, ORG)).toBe(true);
  });

  it('rejects an unknown key', async () => {
    const { service } = makeService();
    await expect(service.setGrant(ORG, 'not-a-module', { granted: false })).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('ModuleAccessService caching', () => {
  it('loads an org layer once and reuses it', async () => {
    const { service, repo, grantRepo } = makeService();
    await service.reload();
    repo.find.mockClear();
    grantRepo.find.mockClear();
    await service.isEnabled(AppModuleKey.PROBLEMS, Role.STUDENT, ORG);
    await service.isEnabled(AppModuleKey.GRADING, Role.STUDENT, ORG);
    expect(repo.find).toHaveBeenCalledTimes(1);
    expect(grantRepo.find).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent cold loads for the same org into one query pair', async () => {
    const { service, repo, grantRepo } = makeService();
    await service.reload();
    repo.find.mockClear();
    grantRepo.find.mockClear();
    await Promise.all([
      service.isEnabled(AppModuleKey.PROBLEMS, Role.STUDENT, ORG),
      service.isEnabled(AppModuleKey.PROBLEMS, Role.PROFESSOR, ORG),
      service.isEnabled(AppModuleKey.GRADING, Role.STUDENT, ORG),
    ]);
    expect(repo.find).toHaveBeenCalledTimes(1);
    expect(grantRepo.find).toHaveBeenCalledTimes(1);
  });

  it('invalidate(orgId) drops only that org; invalidate(null) reloads everything', async () => {
    const { service, setRows, repo } = makeService();
    await service.reload();
    expect(await service.isEnabled(AppModuleKey.PROBLEMS, Role.STUDENT, ORG)).toBe(true);

    setRows([{ moduleKey: AppModuleKey.PROBLEMS, role: Role.STUDENT, enabled: false, orgId: ORG }]);
    expect(await service.isEnabled(AppModuleKey.PROBLEMS, Role.STUDENT, ORG)).toBe(true); // cached
    await service.invalidate(ORG);
    expect(await service.isEnabled(AppModuleKey.PROBLEMS, Role.STUDENT, ORG)).toBe(false);

    repo.find.mockClear();
    await service.invalidate(null);
    expect(repo.find).toHaveBeenCalled(); // platform layer re-read
  });

  it('an org layer load failure serves defaults instead of throwing, and is not cached', async () => {
    const { service, repo } = makeService();
    await service.reload();
    repo.find.mockRejectedValueOnce(new Error('db down'));
    expect(await service.isEnabled(AppModuleKey.PROBLEMS, Role.STUDENT, ORG)).toBe(true);
    // The failure wasn't cached, so the next call retries and can succeed.
    repo.find.mockClear();
    await service.isEnabled(AppModuleKey.PROBLEMS, Role.STUDENT, ORG);
    expect(repo.find).toHaveBeenCalled();
  });
});
