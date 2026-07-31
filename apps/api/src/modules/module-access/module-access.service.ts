import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { IsNull, Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { ModuleAccess } from './entities/module-access.entity';
import { OrgModuleGrant, RoleDefaults } from './entities/org-module-grant.entity';
import { AppModuleKey, SYSTEM_MODULES, TOGGLEABLE_MODULES } from './enums/app-module-key.enum';
import {
  ALL_FEATURES,
  AccessKey,
  FeatureKey,
  featureModule,
  isFeatureKey,
} from './enums/feature-key.enum';
import { FEATURE_DEFAULTS, withinRoleCeiling } from './feature-access.defaults';
import { MODULE_ACCESS_DEFAULTS, isToggleable } from './module-access.defaults';

export interface MatrixCell {
  moduleKey: string;
  role: Role;
  enabled: boolean;
  /** Not editable at this layer — a role ceiling or admin immunity owns it. */
  locked: boolean;
}

export interface GrantInput {
  granted?: boolean;
  roleDefaults?: RoleDefaults | null;
}

interface Grant {
  granted: boolean;
  roleDefaults: RoleDefaults | null;
}

/** One org's lazily-loaded layers: its own overrides plus its SuperAdmin grants. */
interface OrgLayer {
  overrides: Map<string, boolean>; // `${key}:${role}` -> enabled
  grants: Map<string, Grant>; // key -> grant
}

/** How long to wait between boot-time reload retries while the DB isn't ready. */
const RELOAD_RETRY_MS = 15_000;

/** Cross-instance cache invalidation channel (OrganizationCache can share it). */
export const ACCESS_INVALIDATE_CHANNEL = 'module-access:invalidate';

const cell = (key: string, role: Role): string => `${key}:${role}`;
const emptyLayer = (): OrgLayer => ({ overrides: new Map(), grants: new Map() });

/**
 * Resolves effective module/feature access through the 8-layer precedence of
 * §5.5. The highest layer that produces an answer wins:
 *
 *   0  SUPERADMIN                 -> true (the SOLE unconditional bypass)
 *   1  SYSTEM module              -> true (structural; never gateable)
 *   -  a feature's owning module  -> resolved first; a feature dies with its module
 *   2  org grant cap              -> granted=false is a HARD false for the WHOLE org
 *   4  role ceiling               -> non-overridable (see the ordering note)
 *   3  org-admin immunity         -> ADMIN true within granted, ceiling-permitted scope
 *   5  org per-role override      -> module_access (org_id set)
 *   6  platform per-role override -> module_access (org_id NULL)
 *   7  org role_defaults          -> org_module_grant.role_defaults
 *   8  code DEFAULT               -> MODULE_ACCESS_DEFAULTS / FEATURE_DEFAULTS ?? true
 *
 * ORDERING NOTE — 4 is applied BEFORE 3, the reverse of the plan's table. Read
 * literally, admin-immunity-above-ceiling makes every ceiling vacuous for an org
 * admin, and in particular hands them `problems.global`, whose ceiling is
 * deliberately empty ("SuperAdmin only", §5.6) — an org admin could author the
 * cross-org catalog. The immunity exists so an admin cannot be locked out by an
 * OVERRIDE (layers 5-8), not to overrule a code ceiling, so it is applied after it.
 *
 * ADMIN's former unconditional bypass is GONE from the guard and lives here as
 * layer 3, which is exactly what makes an org admin gateable by a SuperAdmin cap.
 *
 * Boot-safe: the initial platform-layer load runs off the bootstrap path and fails
 * soft. If the DB isn't reachable or the tables don't exist yet (fresh deploy
 * before migrations) we start with no overrides and retry in the background rather
 * than throwing out of onModuleInit — which would abort Nest bootstrap in BOTH the
 * API and the worker (they boot the same AppModule). No overrides simply falls
 * through to the code DEFAULTS, which is safe.
 */
@Injectable()
export class ModuleAccessService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ModuleAccessService.name);

  /** The platform layer (org_id IS NULL) — small, global, eagerly warmed. */
  private platform = new Map<string, boolean>();
  /** Per-org layers, loaded on first use and dropped on invalidation. */
  private readonly orgLayers = new Map<string, OrgLayer>();
  /** In-flight loads, so N concurrent requests for a cold org issue one query pair. */
  private readonly inflight = new Map<string, Promise<OrgLayer>>();

  private retryTimer?: NodeJS.Timeout;
  private subscriber?: Redis;

  constructor(
    @InjectRepository(ModuleAccess) private readonly repo: Repository<ModuleAccess>,
    @InjectRepository(OrgModuleGrant) private readonly grants: Repository<OrgModuleGrant>,
    // Optional so unit tests (and any Redis-less context) can construct this;
    // without it the cache is correct per-instance but not cross-instance.
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  onModuleInit(): void {
    void this.warm(); // fire-and-forget: never block bootstrap on a DB read
    this.subscribe();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.subscriber) await this.subscriber.quit().catch(() => undefined);
  }

  // ---------------------------------------------------------------- resolution

  /**
   * The one resolver. `orgId` is the ACTOR's org (null for SuperAdmin) — never a
   * caller-chosen value, or it would resolve some other tenant's layers.
   */
  async isEnabled(key: AccessKey, role: Role, orgId: string | null): Promise<boolean> {
    // 0 — SuperAdmin bypasses every layer, grant caps included.
    if (role === Role.SUPERADMIN) return true;
    if (isFeatureKey(key)) return this.resolveFeature(key, role, orgId);
    return this.resolveModule(key, role, orgId);
  }

  private async resolveModule(
    key: AppModuleKey,
    role: Role,
    orgId: string | null,
  ): Promise<boolean> {
    // 1 — SYSTEM modules are structural and never gateable.
    if (SYSTEM_MODULES.includes(key)) return true;

    const layer = orgId ? await this.orgLayer(orgId) : emptyLayer();

    // 2 — the SuperAdmin's per-org cap: a hard false for everyone in the org.
    if (layer.grants.get(key)?.granted === false) return false;

    // 3 — org-admin immunity: no override may lock an admin out of its own org.
    if (role === Role.ADMIN) return true;

    return this.resolveOverrides(key, role, layer, MODULE_ACCESS_DEFAULTS[key]?.[role]);
  }

  private async resolveFeature(
    key: FeatureKey,
    role: Role,
    orgId: string | null,
  ): Promise<boolean> {
    // A feature can never outlive its module, so resolve the module first. An
    // unregistered prefix (`league` before #69) yields undefined -> deny, so a
    // reserved-but-unbuilt key fails closed instead of reaching the `?? true`.
    const owning = featureModule(key);
    if (!owning) return false;
    if (!(await this.resolveModule(owning, role, orgId))) return false;

    const layer = orgId ? await this.orgLayer(orgId) : emptyLayer();

    // 2 — a cap on the feature itself (its module's cap was applied above).
    if (layer.grants.get(key)?.granted === false) return false;

    // 4 — the non-overridable role ceiling, before admin immunity (see class doc).
    if (!withinRoleCeiling(key, role)) return false;

    // 3 — admin immunity, now bounded by that ceiling.
    if (role === Role.ADMIN) return true;

    return this.resolveOverrides(key, role, layer, FEATURE_DEFAULTS[key]?.[role]);
  }

  /** Layers 5 -> 8, shared by modules and features. */
  private resolveOverrides(
    key: string,
    role: Role,
    layer: OrgLayer,
    codeDefault: boolean | undefined,
  ): boolean {
    // 5 — this org's own override.
    const org = layer.overrides.get(cell(key, role));
    if (org !== undefined) return org;

    // 6 — the platform override.
    const platform = this.platform.get(cell(key, role));
    if (platform !== undefined) return platform;

    // 7 — the SuperAdmin's per-org default for this role.
    const roleDefault = layer.grants.get(key)?.roleDefaults?.[role];
    if (roleDefault !== undefined) return roleDefault;

    // 8 — code DEFAULT; absent means enabled.
    return codeDefault ?? true;
  }

  /** Effective module map for one actor — toggleable keys resolved, SYSTEM always on. */
  async effectiveMapForRole(
    role: Role,
    orgId: string | null,
  ): Promise<Record<AppModuleKey, boolean>> {
    const map = {} as Record<AppModuleKey, boolean>;
    for (const k of TOGGLEABLE_MODULES) map[k] = await this.isEnabled(k, role, orgId);
    for (const k of SYSTEM_MODULES) map[k] = true;
    return map;
  }

  /** Effective feature map for one actor — fills the `features` field of /auth/verify. */
  async effectiveFeatureMap(
    role: Role,
    orgId: string | null,
  ): Promise<Record<FeatureKey, boolean>> {
    const map = {} as Record<FeatureKey, boolean>;
    for (const k of ALL_FEATURES) map[k] = await this.isEnabled(k, role, orgId);
    return map;
  }

  /**
   * Every feature off. For the org-less holding state (#105) — an unassigned user
   * resolves through no org, and reporting entitlements they cannot exercise would
   * make the UI advertise controls that 403.
   */
  allFalseFeatureMap(): Record<FeatureKey, boolean> {
    const map = {} as Record<FeatureKey, boolean>;
    for (const k of ALL_FEATURES) map[k] = false;
    return map;
  }

  /**
   * Matrix for a console. `orgId` null renders the platform layer (the SuperAdmin
   * view); an org id renders that org's effective values. `locked` marks a cell
   * this layer cannot move — admin immunity or a role ceiling owns it.
   */
  async getMatrix(orgId: string | null): Promise<MatrixCell[]> {
    const rows: MatrixCell[] = [];
    const roles = [Role.ADMIN, Role.PROFESSOR, Role.STUDENT];
    for (const key of TOGGLEABLE_MODULES) {
      for (const role of roles) {
        rows.push({
          moduleKey: key,
          role,
          enabled: await this.isEnabled(key, role, orgId),
          locked: role === Role.ADMIN, // immunity: an override can't move it
        });
      }
    }
    for (const key of ALL_FEATURES) {
      for (const role of roles) {
        rows.push({
          moduleKey: key,
          role,
          enabled: await this.isEnabled(key, role, orgId),
          locked: role === Role.ADMIN || !withinRoleCeiling(key, role),
        });
      }
    }
    return rows;
  }

  /**
   * Keys this org's SuperAdmin GRANT has capped off (#71).
   *
   * Distinct from a matrix cell being false. A cell is the org's own preference and
   * its admin can flip it; `granted: false` is a platform cap the org cannot
   * override for ANY role, admin included. The org console must therefore render
   * those rows as locked rather than as togglable-but-off — a toggle there would
   * write a row that the resolver ignores.
   *
   * Not folded into `getMatrix`'s `locked` flag on purpose: that flag means "no
   * override at THIS layer moves it", and a SuperAdmin editing the same matrix
   * through the platform console genuinely can move a grant. One flag cannot mean
   * both things, so the cap is reported separately and each console decides.
   */
  async cappedKeys(orgId: string | null): Promise<string[]> {
    if (!orgId) return [];
    const layer = await this.orgLayer(orgId);
    return [...layer.grants.entries()]
      .filter(([, grant]) => grant.granted === false)
      .map(([key]) => key);
  }

  // -------------------------------------------------------------------- writes

  /**
   * Upsert one override cell. `orgId` null writes the PLATFORM layer (SuperAdmin);
   * an org id writes that org's layer (its admin). Rejects unknown keys, role=admin
   * (immune by design, so a row would be a lie) and any cell the role ceiling
   * forbids — such a row would silently never take effect.
   */
  async setCell(key: string, role: Role, enabled: boolean, orgId: string | null): Promise<void> {
    if (!isToggleable(key) && !isFeatureKey(key)) {
      throw new BadRequestException(`'${key}' is not a toggleable module or feature`);
    }
    if (role === Role.ADMIN) {
      throw new BadRequestException('Admin access cannot be modified');
    }
    if (isFeatureKey(key) && !withinRoleCeiling(key, role)) {
      throw new BadRequestException(`Role '${role}' can never hold feature '${key}'`);
    }

    // IsNull(), not `orgId: null` — TypeORM renders a bare null as `= NULL`, which
    // matches nothing, so the platform layer would insert a duplicate every write
    // (and the partial unique index would reject it).
    const existing = await this.repo.findOne({
      where: { moduleKey: key, role, orgId: orgId ?? IsNull() },
    });
    if (existing) {
      existing.enabled = enabled;
      await this.repo.save(existing);
    } else {
      await this.repo.save(this.repo.create({ moduleKey: key, role, enabled, orgId }));
    }
    await this.invalidate(orgId);
  }

  /**
   * SuperAdmin: set an org's cap and/or per-role defaults for one key. Sparse —
   * a row is written only once something is said about the key.
   */
  async setGrant(orgId: string, key: string, input: GrantInput): Promise<void> {
    if (!isToggleable(key) && !isFeatureKey(key)) {
      throw new BadRequestException(`'${key}' is not a toggleable module or feature`);
    }
    const existing = await this.grants.findOne({
      where: { organizationId: orgId, featureKey: key },
    });
    const row =
      existing ?? this.grants.create({ organizationId: orgId, featureKey: key, granted: true });
    if (input.granted !== undefined) row.granted = input.granted;
    if (input.roleDefaults !== undefined) row.roleDefaults = input.roleDefaults;
    await this.grants.save(row);
    await this.invalidate(orgId);
  }

  // ------------------------------------------------------------------- caching

  /** Attempt the initial platform-layer load; on failure retry in the background. */
  private async warm(): Promise<void> {
    try {
      await this.reload();
      this.logger.log(`Module-access platform layer loaded (${this.platform.size} cells)`);
    } catch (err) {
      this.logger.warn(
        `Module-access load failed; serving code defaults and retrying in ` +
          `${RELOAD_RETRY_MS}ms: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.retryTimer = setTimeout(() => void this.warm(), RELOAD_RETRY_MS);
      if (this.retryTimer.unref) this.retryTimer.unref();
    }
  }

  /** Rebuild the platform layer and drop every cached org layer. */
  async reload(): Promise<void> {
    const rows = await this.repo.find({ where: { orgId: IsNull() } });
    const next = new Map<string, boolean>();
    for (const r of rows) next.set(cell(r.moduleKey, r.role), r.enabled);
    this.platform = next;
    this.orgLayers.clear();
    this.inflight.clear();
  }

  /** Cached org layer, loading it (once) on a miss. */
  private async orgLayer(orgId: string): Promise<OrgLayer> {
    const cached = this.orgLayers.get(orgId);
    if (cached) return cached;

    const pending = this.inflight.get(orgId);
    if (pending) return pending;

    const load = this.loadOrgLayer(orgId)
      .then((layer) => {
        this.orgLayers.set(orgId, layer);
        return layer;
      })
      .catch((err) => {
        // Never cache a failure and never fail the request: an empty layer means
        // "no overrides", which resolves to the code defaults.
        this.logger.warn(
          `Module-access org layer load failed for ${orgId}; using defaults: ` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
        return emptyLayer();
      })
      .finally(() => this.inflight.delete(orgId));

    this.inflight.set(orgId, load);
    return load;
  }

  private async loadOrgLayer(orgId: string): Promise<OrgLayer> {
    const [rows, grantRows] = await Promise.all([
      this.repo.find({ where: { orgId } }),
      this.grants.find({ where: { organizationId: orgId } }),
    ]);
    const layer = emptyLayer();
    for (const r of rows) layer.overrides.set(cell(r.moduleKey, r.role), r.enabled);
    for (const g of grantRows) {
      layer.grants.set(g.featureKey, { granted: g.granted, roleDefaults: g.roleDefaults });
    }
    return layer;
  }

  /**
   * Drop the affected cache locally and tell every other instance to do the same.
   * A platform-layer write (`orgId` null) invalidates everything, since those rows
   * are consulted by every org.
   */
  async invalidate(orgId: string | null): Promise<void> {
    await this.applyInvalidation(orgId);
    if (!this.redis) return;
    try {
      await this.redis.publish(ACCESS_INVALIDATE_CHANNEL, JSON.stringify({ orgId }));
    } catch (err) {
      // The local write already took effect; only OTHER instances stay stale, until
      // their next write or restart. Losing the fan-out must not fail the request.
      this.logger.warn(
        `Module-access invalidation publish failed: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async applyInvalidation(orgId: string | null): Promise<void> {
    if (orgId === null) {
      await this.reload();
      return;
    }
    this.orgLayers.delete(orgId);
    this.inflight.delete(orgId);
  }

  /**
   * Subscribe to the invalidation channel on a DUPLICATED connection — a
   * subscribed ioredis client cannot run normal commands, so the shared
   * REDIS_CLIENT must never be put into subscriber mode.
   */
  private subscribe(): void {
    if (!this.redis) {
      this.logger.warn(
        'No Redis client — module-access cache invalidation is single-instance only',
      );
      return;
    }
    const sub = this.redis.duplicate();
    this.subscriber = sub;
    sub.on('error', (err: Error) =>
      this.logger.warn(`Module-access invalidation subscriber error: ${err.message}`),
    );
    sub.on('message', (channel: string, raw: string) => {
      if (channel !== ACCESS_INVALIDATE_CHANNEL) return;
      let orgId: string | null = null;
      try {
        orgId = (JSON.parse(raw) as { orgId: string | null }).orgId ?? null;
      } catch {
        orgId = null; // unparseable: drop everything rather than trust a partial read
      }
      void this.applyInvalidation(orgId).catch((err: Error) =>
        this.logger.warn(`Module-access invalidation apply failed: ${err.message}`),
      );
    });
    void sub.subscribe(ACCESS_INVALIDATE_CHANNEL).catch((err: Error) => {
      this.logger.warn(`Module-access invalidation subscribe failed: ${err.message}`);
    });
  }
}
