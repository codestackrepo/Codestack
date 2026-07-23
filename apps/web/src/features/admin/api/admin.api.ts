import { apiClient } from '@/lib/api-client';
import type { AssignmentStatus } from '@/types/assignment';

/**
 * Mirror of the backend `AdminOverview` (`GET /admin/overview`, admin-only, #40).
 * Field names/shape track `admin.service.ts` exactly — a drift here compiles
 * green but renders `undefined`, so keep it in lockstep with the DTO.
 */
export interface AdminOverview {
  users: {
    total: number;
    admins: number;
    professors: number;
    students: number;
    active: number;
    inactive: number;
  };
  classrooms: { total: number };
  problems: { total: number };
  assignments: {
    total: number;
    byStatus: Record<AssignmentStatus, number>;
    tests: number;
  };
  submissions: { total: number };
  onboarding: { pendingRequests: number; activeInvites: number };
}

export const adminApi = {
  async overview(): Promise<AdminOverview> {
    const { data } = await apiClient.get<AdminOverview>('/admin/overview');
    return data;
  },
};
