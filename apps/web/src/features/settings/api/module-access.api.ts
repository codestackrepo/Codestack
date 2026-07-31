import { apiClient } from '@/lib/api-client';
import type { AppModuleKey, Role } from '@/types/common';

/** One Module × Role cell of the admin matrix. Admin cells are `locked` (checked + disabled). */
export interface MatrixCell {
  moduleKey: AppModuleKey;
  role: Role;
  enabled: boolean;
  locked: boolean;
}

export interface ModuleAccessMatrix {
  toggleable: AppModuleKey[];
  system: AppModuleKey[];
  matrix: MatrixCell[];
  /**
   * Keys a platform GRANT has switched off for this organization (#71).
   *
   * Different from a cell being false: a cell is this org's own preference and its
   * admin may flip it, while a capped key is a hard false for every role here —
   * admin included — that no override can lift. Such a row must render locked, or
   * the toggle writes a value the resolver ignores.
   */
  capped?: string[];
}

export const moduleAccessApi = {
  async getMatrix(): Promise<ModuleAccessMatrix> {
    const { data } = await apiClient.get<ModuleAccessMatrix>('/module-access');
    return data;
  },

  async updateCell(
    moduleKey: AppModuleKey,
    role: Role,
    enabled: boolean,
  ): Promise<ModuleAccessMatrix> {
    const { data } = await apiClient.patch<ModuleAccessMatrix>('/module-access', {
      moduleKey,
      role,
      enabled,
    });
    return data;
  },
};
