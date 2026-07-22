/**
 * User roles. NOTE: "grader" is intentionally NOT a role — in the domain a
 * grader is a `student`-role user placed in a classroom's graders set.
 */
export enum Role {
  ADMIN = 'admin',
  PROFESSOR = 'professor',
  STUDENT = 'student',
}

export const STAFF_ROLES: Role[] = [Role.ADMIN, Role.PROFESSOR];
