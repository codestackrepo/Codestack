import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ClassroomsService } from './classrooms.service';
import { Classroom } from './entities/classroom.entity';

describe('ClassroomsService.removeStudent — batch purge', () => {
  let classrooms: { findOne: jest.Mock; save: jest.Mock };
  let users: { find: jest.Mock; findOne: jest.Mock };
  let dataSource: { query: jest.Mock };
  let service: ClassroomsService;

  const admin: AuthenticatedUser = { id: 'admin-1', role: Role.ADMIN, email: 'a@x.io' };
  const CLASSROOM_ID = 'c-1';
  const STUDENT_ID = 's-1';

  beforeEach(() => {
    const classroom = {
      id: CLASSROOM_ID,
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
