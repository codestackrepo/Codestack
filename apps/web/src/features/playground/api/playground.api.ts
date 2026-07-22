import { apiClient } from '@/lib/api-client';
import type { PlaygroundResult, PlaygroundRunInput } from '../types';

export const playgroundApi = {
  /**
   * Runs raw user code against optional stdin. Public route (no auth cookie
   * required), success is HTTP 200, per-IP throttled (10/min, 100/day → 429).
   * apiClient.baseURL already includes /api/v1, so the path is /playground/run.
   */
  async run(input: PlaygroundRunInput): Promise<PlaygroundResult> {
    const { data } = await apiClient.post<PlaygroundResult>('/playground/run', input);
    return data;
  },
};
