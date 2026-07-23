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
