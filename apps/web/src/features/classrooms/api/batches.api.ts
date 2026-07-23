import { apiClient } from '@/lib/api-client';
import type { Batch, CreateBatchInput, UpdateBatchInput } from '@/types/classroom';

/**
 * Batch management under a classroom. All routes are staff-only server-side
 * (@Roles(ADMIN, PROFESSOR)); the classroom's ownership check is the real gate.
 * Base path: /classrooms/:classroomId/batches
 */
export const batchesApi = {
  async list(classroomId: string): Promise<Batch[]> {
    const { data } = await apiClient.get<Batch[]>(`/classrooms/${classroomId}/batches`);
    return data;
  },

  async create(classroomId: string, input: CreateBatchInput): Promise<Batch> {
    const { data } = await apiClient.post<Batch>(`/classrooms/${classroomId}/batches`, input);
    return data;
  },

  async update(classroomId: string, batchId: string, input: UpdateBatchInput): Promise<Batch> {
    const { data } = await apiClient.patch<Batch>(
      `/classrooms/${classroomId}/batches/${batchId}`,
      input,
    );
    return data;
  },

  async remove(classroomId: string, batchId: string): Promise<void> {
    await apiClient.delete(`/classrooms/${classroomId}/batches/${batchId}`);
  },

  async addStudents(classroomId: string, batchId: string, studentIds: string[]): Promise<Batch> {
    const { data } = await apiClient.post<Batch>(
      `/classrooms/${classroomId}/batches/${batchId}/students`,
      { studentIds },
    );
    return data;
  },

  async removeStudent(classroomId: string, batchId: string, studentId: string): Promise<Batch> {
    const { data } = await apiClient.delete<Batch>(
      `/classrooms/${classroomId}/batches/${batchId}/students/${studentId}`,
    );
    return data;
  },
};
