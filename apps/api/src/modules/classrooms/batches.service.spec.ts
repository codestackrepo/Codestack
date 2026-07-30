import { BadRequestException, ConflictException } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { BatchesService } from './batches.service';
import { Batch } from './entities/batch.entity';
import { Classroom } from './entities/classroom.entity';

type MockRepo = {
  find: jest.Mock;
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  remove: jest.Mock;
};

describe('BatchesService', () => {
  let batches: MockRepo;
  let users: MockRepo;
  let classroomsService: { getDetail: jest.Mock; assertCanManage: jest.Mock };
  let dataSource: { query: jest.Mock };
  let service: BatchesService;

  const CLASSROOM_ID = 'c-1';
  const actor: AuthenticatedUser = {
    id: 'prof-1',
    role: Role.PROFESSOR,
    email: 'p@x.io',
    organizationId: 'org-test',
  };

  const classroom = (studentIds: string[]): Classroom =>
    ({ id: CLASSROOM_ID, students: studentIds.map((id) => ({ id })) }) as Classroom;

  beforeEach(() => {
    batches = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((d) => ({ ...d })),
      save: jest.fn((e) => Promise.resolve({ id: 'b-1', ...e })),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    users = {
      find: jest.fn((opts) =>
        Promise.resolve((opts?.where?.id?._value ?? []).map((id: string) => ({ id }))),
      ),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };
    classroomsService = { getDetail: jest.fn(), assertCanManage: jest.fn() };
    dataSource = { query: jest.fn().mockResolvedValue([]) };
    service = new BatchesService(
      batches as never,
      users as never,
      classroomsService as never,
      dataSource as never,
    );
  });

  it('delegates the permission check to ClassroomsService.assertCanManage', async () => {
    classroomsService.getDetail.mockResolvedValue(classroom([]));
    await service.list(CLASSROOM_ID, actor);
    expect(classroomsService.assertCanManage).toHaveBeenCalledWith(actor, expect.anything());
  });

  it('rejects a student who is not a member of the classroom (subset invariant)', async () => {
    classroomsService.getDetail.mockResolvedValue(classroom(['s1']));
    await expect(
      service.create(CLASSROOM_ID, { name: 'A', studentIds: ['s2'] }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a duplicate (classroomId, name) with a 409', async () => {
    classroomsService.getDetail.mockResolvedValue(classroom(['s1']));
    batches.findOne.mockResolvedValue({ id: 'other', name: 'A' } as Batch);
    await expect(
      service.create(CLASSROOM_ID, { name: 'A', studentIds: [] }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses to delete a batch referenced by an assignment target (409)', async () => {
    classroomsService.getDetail.mockResolvedValue(classroom(['s1']));
    batches.findOne.mockResolvedValue({
      id: 'b-1',
      classroomId: CLASSROOM_ID,
      students: [],
    } as unknown as Batch);
    dataSource.query.mockResolvedValue([{ '?column?': 1 }]); // referenced
    await expect(service.remove(CLASSROOM_ID, 'b-1', actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(batches.remove).not.toHaveBeenCalled();
  });

  it('deletes a batch when no assignment references it', async () => {
    classroomsService.getDetail.mockResolvedValue(classroom(['s1']));
    batches.findOne.mockResolvedValue({
      id: 'b-1',
      classroomId: CLASSROOM_ID,
      students: [],
    } as unknown as Batch);
    dataSource.query.mockResolvedValue([]); // not referenced
    await service.remove(CLASSROOM_ID, 'b-1', actor);
    expect(batches.remove).toHaveBeenCalled();
  });
});
