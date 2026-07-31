import { apiClient } from '@/lib/api-client';
import type { BulkInviteResult, RosterPreview } from '@/types/bulk';

export interface CommitInput {
  stagingKey: string;
  excludeRowNumbers?: number[];
  resendPending?: boolean;
}

export const bulkInviteApi = {
  /** Multipart. Writes nothing to the database — parse, classify, stage. */
  async preview(file: File): Promise<RosterPreview> {
    const form = new FormData();
    form.append('file', file);
    // No explicit Content-Type: the browser must set the multipart boundary, and
    // naming the header manually omits it and yields an unparseable body.
    const { data } = await apiClient.post<RosterPreview>('/invites/bulk/preview', form);
    return data;
  },

  /** Echoes the opaque staging key, so the committed rows are provably the reviewed ones. */
  async commit(input: CommitInput): Promise<BulkInviteResult> {
    const { data } = await apiClient.post<BulkInviteResult>('/invites/bulk/commit', input);
    return data;
  },
};
