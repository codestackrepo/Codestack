import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ClassroomsService } from './classrooms.service';
import { Classroom } from './entities/classroom.entity';

describe('ClassroomsService.removeStudent — batch purge', () => {
  let classrooms: { findOne: jest.Mock; save: jest.Mock };
  let users: { find: jest.Mock; findOne: jest.Mock };
  let dataSource: { query: jest.Mock };
  let service: ClassroomsService;

  const admin: AuthenticatedUser = { id: 'admin-1', role: Role.ADMIN, email: 'a@x.io', organizationId: 'org-test' };
  const CLASSROOM_ID = 'c-1';
  const STUDENT_ID = 's-1';

  beforeEach(() => {
    const classroom = {
      id: CLASSROOM_ID,
      organizationId: 'org-test', // same org as `admin` so assertCanManage passes
      students: [{ id: STUDENT_ID }, { id: 's-2' }],
      graders: [],
      professor: null,
    } as unknown as Classroom;
    classrooms = {
      findOne: jest.fn().mockResolvedValue(classroom),
      save: jest.fn((e) => Promise.resolve(e)),
    };
    users = { find: jest.fn(), findOne: jest.fn() };
    dataSource = { query: jest.fn().mockResolvedValue(undefined) };
    service = new ClassroomsService(classrooms as never, users as never, dataSource as never);
  });

  it('deletes the student from every batch in the classroom', async () => {
    await service.removeStudent(CLASSROOM_ID, STUDENT_ID, admin);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM batch_students'),
      [CLASSROOM_ID, STUDENT_ID],
    );
  });

  it('persists the reduced student roster before purging batches', async () => {
    await service.removeStudent(CLASSROOM_ID, STUDENT_ID, admin);
    const saved = classrooms.save.mock.calls[0][0] as Classroom;
    expect(saved.students.some((s) => s.id === STUDENT_ID)).toBe(false);
  });
});

// The shared hinge that org-bounds assignments' manage-path AND all grading
// staff reads/writes. Pure (actor, classroom) methods — no repos needed.
describe('ClassroomsService — cross-org isolation (#50)', () => {
  const service = new ClassroomsService({} as never, {} as never, {} as never);
  const orgAClass = {
    id: 'c',
    organizationId: 'org-A',
    createdById: 'owner',
    professorId: null,
    graders: [],
  } as unknown as Classroom;
  const mk = (role: Role, org: string | null): AuthenticatedUser => ({
    id: 'u',
    email: 'u@x.io',
    role,
    organizationId: org,
  });

  it('assertStaffOrGrader: a cross-org admin is rejected', () => {
    expect(() => service.assertStaffOrGrader(mk(Role.ADMIN, 'org-B'), orgAClass)).toThrow();
  });
  it('assertStaffOrGrader: a same-org admin passes', () => {
    expect(() => service.assertStaffOrGrader(mk(Role.ADMIN, 'org-A'), orgAClass)).not.toThrow();
  });
  it('assertStaffOrGrader: a superadmin passes cross-org', () => {
    expect(() => service.assertStaffOrGrader(mk(Role.SUPERADMIN, null), orgAClass)).not.toThrow();
  });
  it('assertCanManage: a cross-org admin is rejected', () => {
    expect(() => service.assertCanManage(mk(Role.ADMIN, 'org-B'), orgAClass)).toThrow();
  });
});
