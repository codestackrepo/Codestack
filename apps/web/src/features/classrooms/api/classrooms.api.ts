import { apiClient } from '@/lib/api-client';
import type { Classroom, CreateClassroomInput } from '@/types/classroom';
import type { PaginatedResult } from '@/types/common';

export const classroomsApi = {
  async list(page = 1, limit = 20): Promise<PaginatedResult<Classroom>> {
    const { data } = await apiClient.get<PaginatedResult<Classroom>>('/classrooms', {
      params: { page, limit },
    });
    return data;
  },

  async getById(id: string): Promise<Classroom> {
    const { data } = await apiClient.get<Classroom>(`/classrooms/${id}`);
    return data;
  },

  async create(input: CreateClassroomInput): Promise<Classroom> {
    const { data } = await apiClient.post<Classroom>('/classrooms', input);
    return data;
  },
};
