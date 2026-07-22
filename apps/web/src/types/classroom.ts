import type { User } from './user';

export interface Classroom {
  id: string;
  courseId: string;
  title: string;
  description: string;
  term: string;
  startDate: string;
  endDate: string;
  totalUsers: number;
  createdById: string;
  professor: User | null;
  students?: User[];
  graders?: User[];
}

export interface CreateClassroomInput {
  courseId: string;
  title: string;
  description?: string;
  term?: string;
  startDate: string;
  endDate: string;
  professorId?: string;
  studentIds?: string[];
  graderIds?: string[];
}
