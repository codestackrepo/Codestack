import { ConflictException } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

type MockRepo = {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};

describe('UsersService.create — role assignment', () => {
  let repo: MockRepo;
  let service: UsersService;

  const dto = (role?: Role): CreateUserDto => ({
    email: 'new-user@codestack.dev',
    password: 'Password1',
    firstName: 'New',
    lastName: 'User',
    role,
  });

  const actor = (role: Role): AuthenticatedUser => ({
    id: 'actor-id',
    email: 'actor@x.dev',
    role,
    organizationId: 'org-test',
  });

  beforeEach(() => {
    repo = {
      findOne: jest.fn().mockResolvedValue(null), // no existing user by default
      create: jest.fn((data) => data),
      save: jest.fn((entity) => Promise.resolve({ ...entity, id: 'new-id' } as User)),
    };
    service = new UsersService(repo as unknown as import('typeorm').Repository<User>);
  });

  it('rejects when the email is already registered', async () => {
    repo.findOne.mockResolvedValueOnce({ id: 'existing' });
    await expect(service.create(dto(), actor(Role.ADMIN))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('defaults to STUDENT when no role is requested', async () => {
    const user = await service.create(dto(), actor(Role.ADMIN));
    expect(user.role).toBe(Role.STUDENT);
  });

  // Regression test: a PROFESSOR actor was previously able to mint an ADMIN
  // account by simply passing role: 'admin' in the request body — the
  // service applied dto.role unconditionally regardless of who was asking.
  describe('regression: privilege escalation via role in the request body', () => {
    it('forces STUDENT when a PROFESSOR actor requests an elevated role', async () => {
      const user = await service.create(dto(Role.ADMIN), actor(Role.PROFESSOR));
      expect(user.role).toBe(Role.STUDENT);
    });

    it('forces STUDENT when a PROFESSOR actor requests role=PROFESSOR too', async () => {
      const user = await service.create(dto(Role.PROFESSOR), actor(Role.PROFESSOR));
      expect(user.role).toBe(Role.STUDENT);
    });

    it('allows an ADMIN actor to assign an elevated role', async () => {
      const user = await service.create(dto(Role.ADMIN), actor(Role.ADMIN));
      expect(user.role).toBe(Role.ADMIN);
    });

    it('allows an ADMIN actor to assign PROFESSOR', async () => {
      const user = await service.create(dto(Role.PROFESSOR), actor(Role.ADMIN));
      expect(user.role).toBe(Role.PROFESSOR);
    });
  });

  it('honors dto.role as-is when no actor is supplied (internal self-registration path, which itself always forces STUDENT before calling in)', async () => {
    const user = await service.create(dto(Role.PROFESSOR));
    expect(user.role).toBe(Role.PROFESSOR);
  });
});
