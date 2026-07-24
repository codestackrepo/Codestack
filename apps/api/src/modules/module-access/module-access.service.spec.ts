import { BadRequestException } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';
import { ModuleAccess } from './entities/module-access.entity';
import { AppModuleKey, SYSTEM_MODULES, TOGGLEABLE_MODULES } from './enums/app-module-key.enum';
import { ModuleAccessService } from './module-access.service';

type Rows = Partial<ModuleAccess>[];

function makeService(initial: Rows = []) {
  let rows: Rows = [...initial];
  const repo = {
    find: jest.fn(async () => rows),
    findOne: jest.fn(async ({ where }: { where: { moduleKey: string; role: string } }) =>
      rows.find((r) => r.moduleKey === where.moduleKey && r.role === where.role),
    ),
    create: jest.fn((d: Partial<ModuleAccess>) => d),
    save: jest.fn(async (d: Partial<ModuleAccess>) => {
      const idx = rows.findIndex((r) => r.moduleKey === d.moduleKey && r.role === d.role);
      if (idx >= 0) rows[idx] = { ...rows[idx], ...d };
      else rows.push(d);
      return d;
    }),
  };
  const service = new ModuleAccessService(repo as never);
  return { service, repo, setRows: (r: Rows) => (rows = [...r]) };
}

describe('ModuleAccessService.isEnabled', () => {
  it('admin is always enabled regardless of overrides', async () => {
    const { service } = makeService([
      { moduleKey: AppModuleKey.PROBLEMS, role: Role.ADMIN, enabled: false },
    ]);
    await service.reload();
    expect(service.isEnabled(AppModuleKey.PROBLEMS, Role.ADMIN)).toBe(true);
  });

  it('an override wins over the DEFAULT', async () => {
    const { service } = makeService([
      { moduleKey: AppModuleKey.PLAYGROUND, role: Role.STUDENT, enabled: false },
    ]);
    await service.reload();
    expect(service.isEnabled(AppModuleKey.PLAYGROUND, Role.STUDENT)).toBe(false);
  });

  it('falls back to DEFAULT when no override (grading off, problems on for students)', async () => {
    const { service } = makeService();
    await service.reload();
    expect(service.isEnabled(AppModuleKey.GRADING, Role.STUDENT)).toBe(false);
    expect(service.isEnabled(AppModuleKey.PROBLEMS, Role.STUDENT)).toBe(true);
  });

  it('reload() re-reads the repo (changed rows flip the result)', async () => {
    const { service, setRows } = makeService();
    await service.reload();
    expect(service.isEnabled(AppModuleKey.PROBLEMS, Role.STUDENT)).toBe(true);
    setRows([{ moduleKey: AppModuleKey.PROBLEMS, role: Role.STUDENT, enabled: false }]);
    await service.reload();
    expect(service.isEnabled(AppModuleKey.PROBLEMS, Role.STUDENT)).toBe(false);
  });
});

describe('ModuleAccessService.effectiveMapForRole', () => {
  it('resolves every toggleable key + all SYSTEM keys true', async () => {
    const { service } = makeService();
    await service.reload();
    const map = service.effectiveMapForRole(Role.STUDENT);
    for (const k of TOGGLEABLE_MODULES) expect(typeof map[k]).toBe('boolean');
    for (const k of SYSTEM_MODULES) expect(map[k]).toBe(true);
    expect(map[AppModuleKey.GRADING]).toBe(false);
    expect(map[AppModuleKey.PROBLEMS]).toBe(true);
  });
});

describe('ModuleAccessService.getMatrix', () => {
  it('returns TOGGLEABLE_MODULES.length * 3 rows with admin cells locked+enabled', async () => {
    const { service } = makeService();
    await service.reload();
    const matrix = service.getMatrix();
    expect(matrix).toHaveLength(TOGGLEABLE_MODULES.length * 3);
    for (const cell of matrix.filter((c) => c.role === Role.ADMIN)) {
      expect(cell.locked).toBe(true);
      expect(cell.enabled).toBe(true);
    }
  });
});

describe('ModuleAccessService.setCell', () => {
  it('persists an override then reload flips isEnabled', async () => {
    const { service } = makeService();
    await service.reload();
    await service.setCell('problems', Role.STUDENT, false);
    expect(service.isEnabled(AppModuleKey.PROBLEMS, Role.STUDENT)).toBe(false);
  });

  it('rejects a non-toggleable (SYSTEM) key', async () => {
    const { service } = makeService();
    await expect(service.setCell('dashboard', Role.STUDENT, false)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects toggling admin', async () => {
    const { service } = makeService();
    await expect(service.setCell('problems', Role.ADMIN, false)).rejects.toThrow(
      BadRequestException,
    );
  });
});
