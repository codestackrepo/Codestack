import { apiClient } from '@/lib/api-client';
import type { CreateGenerationInput, GeneratedProblemLink, GenerationRequest } from '../types';

export const aiApi = {
  /**
   * POST /ai/generations — multipart/form-data. The upload field is exactly
   * "file"; topic/prompt/count are sibling form fields (count sent as a string,
   * coerced server-side). We deliberately do NOT set a Content-Type header — the
   * browser sets the multipart boundary itself. Returns 202 Accepted.
   */
  async create(input: CreateGenerationInput): Promise<GenerationRequest> {
    const form = new FormData();
    form.append('topic', input.topic);
    form.append('count', String(input.count));
    if (input.prompt && input.prompt.trim().length > 0) {
      form.append('prompt', input.prompt);
    }
    if (input.file) {
      form.append('file', input.file);
    }
    const { data } = await apiClient.post<GenerationRequest>('/ai/generations', form);
    return data;
  },

  async list(): Promise<GenerationRequest[]> {
    const { data } = await apiClient.get<GenerationRequest[]>('/ai/generations');
    return data;
  },

  async getById(id: string): Promise<GenerationRequest> {
    const { data } = await apiClient.get<GenerationRequest>(`/ai/generations/${id}`);
    return data;
  },

  async getProblems(id: string): Promise<GeneratedProblemLink[]> {
    const { data } = await apiClient.get<GeneratedProblemLink[]>(`/ai/generations/${id}/problems`);
    return data;
  },

  /** POST /ai/generations/:id/problems/:linkId/save — only valid from 'validated'. */
  async saveProblem(id: string, linkId: string): Promise<GeneratedProblemLink> {
    const { data } = await apiClient.post<GeneratedProblemLink>(
      `/ai/generations/${id}/problems/${linkId}/save`,
    );
    return data;
  },
};
