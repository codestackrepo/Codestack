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

/** PATCH /classrooms/:id — every field optional (mirrors UpdateClassroomDto). */
export type UpdateClassroomInput = Partial<CreateClassroomInput>;

/**
 * A cohort within a classroom. Its membership is always a subset of the
 * classroom's enrolled students (server-enforced §9.10). `students` are full
 * user objects; `studentCount` is a convenience mirror of `students.length`.
 */
export interface Batch {
  id: string;
  name: string;
  classroomId: string;
  students: User[];
  studentCount: number;
}

export interface CreateBatchInput {
  name: string;
  /** Initial members — must be classroom students. */
  studentIds?: string[];
}

export interface UpdateBatchInput {
  name?: string;
  /** When provided, REPLACES the full membership. */
  studentIds?: string[];
}
