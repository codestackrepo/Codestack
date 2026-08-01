import { apiClient } from '@/lib/api-client';
import type { PaginatedResult } from '@/types/common';
import { OrgApplicationStatus } from './organization-applications.api';

/** Mirrors `CreateProfessorApplicationDto`. No password — that is set by accepting the invite. */
export interface SubmitProfessorApplicationInput {
  email: string;
  firstName: string;
  lastName: string;
  institution?: string;
  message?: string;
}

/** Mirrors `ProfessorApplicationDto`. */
export interface ProfessorApplication {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  institution: string | null;
  message: string;
  status: OrgApplicationStatus;
  reviewedById: string | null;
  reviewedAt: string | null;
  decisionReason: string;
  inviteId: string | null;
  createdAt: string;
}

export const professorApplicationKeys = {
  list: (status?: OrgApplicationStatus) =>
    ['platform', 'professor-applications', status ?? 'all'] as const,
};

export const professorApplicationsApi = {
  /**
   * Public. One fixed 202 whatever happened — a pending application, or an address that
   * already has an account, are both indistinguishable from success, because a
   * difference would make this an account-existence oracle.
   */
  async submit(input: SubmitProfessorApplicationInput): Promise<{ message: string }> {
    const { data } = await apiClient.post<{ message: string }>('/professor-applications', input);
    return data;
  },

  async list(status?: OrgApplicationStatus): Promise<PaginatedResult<ProfessorApplication>> {
    const { data } = await apiClient.get<PaginatedResult<ProfessorApplication>>(
      '/platform/professor-applications',
      { params: status ? { status } : undefined },
    );
    return data;
  },

  /**
   * Approving mints a PROFESSOR invite into the community tenant and emails it.
   *
   * Can fail `application_approved_invite_failed` after the status is already approved —
   * deliberately not rolled back, or two reviewers could race again. That reason means
   * "invite them by hand", never "approve again".
   */
  async approve(id: string): Promise<ProfessorApplication> {
    const { data } = await apiClient.post<ProfessorApplication>(
      `/platform/professor-applications/${id}/approve`,
    );
    return data;
  },

  async reject(id: string, reason?: string): Promise<ProfessorApplication> {
    const { data } = await apiClient.post<ProfessorApplication>(
      `/platform/professor-applications/${id}/reject`,
      { reason },
    );
    return data;
  },
};
