import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { ModuleAccess } from './entities/module-access.entity';
import { AppModuleKey, SYSTEM_MODULES, TOGGLEABLE_MODULES } from './enums/app-module-key.enum';
import { MODULE_ACCESS_DEFAULTS, isToggleable } from './module-access.defaults';

export interface MatrixCell {
  moduleKey: AppModuleKey;
  role: Role;
  enabled: boolean;
  locked: boolean;
}

/** How long to wait between boot-time reload retries while the DB isn't ready. */
const RELOAD_RETRY_MS = 15_000;

/**
 * Resolves effective per-role module access from DB overrides layered on the
 * code-level DEFAULTS, backed by a single-instance in-memory cache rebuilt on
 * every write (§10: Redis pub/sub invalidation is deferred to M3).
 *
 * Boot-safe: the initial load runs off the bootstrap path and fails soft. If the
 * DB isn't reachable or the `module_access` table doesn't exist yet (fresh
 * deploy before migrations), we start with no overrides and retry in the
 * background rather than throwing out of onModuleInit — which would abort Nest
 * bootstrap in BOTH the API and the worker (they boot the same AppModule).
 * Empty overrides just fall through to MODULE_ACCESS_DEFAULTS, which is safe.
 */
@Injectable()
export class ModuleAccessService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ModuleAccessService.name);
  private overrides = new Map<string, boolean>(); // key = `${moduleKey}:${role}`
  private retryTimer?: NodeJS.Timeout;

  constructor(@InjectRepository(ModuleAccess) private readonly repo: Repository<ModuleAccess>) {}

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
      this.logger.log(`Module-access overrides loaded (${this.overrides.size} cells)`);
    } catch (err) {
      this.logger.warn(
        `Module-access override load failed; serving defaults and retrying in ` +
          `${RELOAD_RETRY_MS}ms: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.retryTimer = setTimeout(() => void this.warm(), RELOAD_RETRY_MS);
      if (this.retryTimer.unref) this.retryTimer.unref();
    }
  }

  /** Rebuild the in-memory override map from the DB. */
  async reload(): Promise<void> {
    const rows = await this.repo.find();
    const next = new Map<string, boolean>();
    for (const r of rows) next.set(`${r.moduleKey}:${r.role}`, r.enabled);
    this.overrides = next;
  }

  /**
   * Effective enabled: SUPERADMIN always true (sole unconditional bypass); ADMIN
   * still true today (kept here rather than in the guard, so #64's per-org grant
   * can later make admin gateable at this seam); else override if present, else
   * DEFAULT.
   */
  isEnabled(moduleKey: AppModuleKey, role: Role): boolean {
    if (role === Role.SUPERADMIN) return true;
    if (role === Role.ADMIN) return true;
    const override = this.overrides.get(`${moduleKey}:${role}`);
    if (override !== undefined) return override;
    return MODULE_ACCESS_DEFAULTS[moduleKey]?.[role] ?? true;
  }

  /** Effective map for one role: every toggleable key resolved + every SYSTEM key = true. */
  effectiveMapForRole(role: Role): Record<AppModuleKey, boolean> {
    const map = {} as Record<AppModuleKey, boolean>;
    for (const k of TOGGLEABLE_MODULES) map[k] = this.isEnabled(k, role);
    for (const k of SYSTEM_MODULES) map[k] = true; // always-on
    return map;
  }

  /** Full admin matrix: one entry per toggleable key × role (admin cells locked-on). */
  getMatrix(): MatrixCell[] {
    const rows: MatrixCell[] = [];
    for (const k of TOGGLEABLE_MODULES) {
      for (const role of [Role.ADMIN, Role.PROFESSOR, Role.STUDENT]) {
        rows.push({
          moduleKey: k,
          role,
          enabled: this.isEnabled(k, role),
          locked: role === Role.ADMIN,
        });
      }
    }
    return rows;
  }

  /** Upsert one override cell then rebuild the cache. Rejects admin/system/unknown keys. */
  async setCell(moduleKey: string, role: Role, enabled: boolean): Promise<void> {
    if (!isToggleable(moduleKey)) {
      throw new BadRequestException(`Module '${moduleKey}' is not toggleable`);
    }
    if (role === Role.ADMIN) {
      throw new BadRequestException('Admin access cannot be modified');
    }
    const existing = await this.repo.findOne({
      where: { moduleKey: moduleKey as AppModuleKey, role },
    });
    if (existing) {
      existing.enabled = enabled;
      await this.repo.save(existing);
    } else {
      await this.repo.save(
        this.repo.create({ moduleKey: moduleKey as AppModuleKey, role, enabled }),
      );
    }
    await this.reload(); // rebuild in-memory cache so the guard + /verify see it immediately
  }
}
