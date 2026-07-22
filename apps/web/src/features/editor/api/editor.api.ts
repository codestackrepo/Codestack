import { apiClient } from '@/lib/api-client';
import type { Language } from '@/types/common';
import type {
  EditorBootstrap,
  RunResult,
  SampleTestcase,
  Submission,
  SubmitResult,
} from '@/types/submission';

export const editorApi = {
  async bootstrap(assignmentProblemId: string): Promise<EditorBootstrap> {
    const { data } = await apiClient.get<EditorBootstrap>(
      `/assignments/problems/${assignmentProblemId}/editor`,
    );
    return data;
  },

  async run(
    assignmentProblemId: string,
    language: Language,
    userCode: string,
    sampleTestcases: SampleTestcase[],
  ): Promise<RunResult> {
    const { data } = await apiClient.post<RunResult>('/code-execution/run', {
      assignmentProblemId,
      language,
      userCode,
      // The /run endpoint's DTO uses input/expected — a different naming
      // convention than the problem entity's inputData/expectedOutput.
      sampleTestcases: sampleTestcases.map((tc) => ({
        input: tc.inputData,
        expected: tc.expectedOutput,
      })),
    });
    return data;
  },

  async submit(
    assignmentProblemId: string,
    language: Language,
    userCode: string,
  ): Promise<SubmitResult> {
    const { data } = await apiClient.post<SubmitResult>('/code-execution/submit', {
      assignmentProblemId,
      language,
      userCode,
    });
    return data;
  },

  async getSubmission(id: string): Promise<Submission> {
    const { data } = await apiClient.get<Submission>(`/submissions/${id}`);
    return data;
  },

  async listSubmissions(assignmentProblemId: string, userId: string): Promise<Submission[]> {
    const { data } = await apiClient.get<Submission[]>('/submissions', {
      params: { assignmentProblemId, userId },
    });
    return data;
  },
};
