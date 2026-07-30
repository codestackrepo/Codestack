import { ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

type MockRepo = {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  // create() wraps its insert in repo.manager.transaction so the #66 quota check
  // holds the org's row lock across the insert.
  manager?: { transaction: jest.Mock };
};

const noQuota = () => ({ assertWithinQuota: jest.fn().mockResolvedValue(undefined) });

describe('UsersService.create — role assignment', () => {
  let repo: MockRepo;
  let quotas: { assertWithinQuota: jest.Mock };
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
    // create() now runs inside repo.manager.transaction so the quota check holds a
    // row lock for the insert (#66); the stub just runs the callback inline.
    repo.manager = {
      transaction: jest.fn((cb: (m: unknown) => unknown) => cb({ getRepository: () => repo })),
    };
    quotas = { assertWithinQuota: jest.fn().mockResolvedValue(undefined) };
    service = new UsersService(
      repo as unknown as import('typeorm').Repository<User>,
      quotas as never,
    );
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

  it('charges MAX_USERS inside the transaction, before the insert (#66)', async () => {
    const order: string[] = [];
    quotas.assertWithinQuota.mockImplementation(async () => void order.push('quota'));
    repo.save.mockImplementation(async (e: unknown) => {
      order.push('save');
      return e;
    });
    await service.create(dto(), actor(Role.ADMIN));
    expect(repo.manager!.transaction).toHaveBeenCalled();
    expect(quotas.assertWithinQuota).toHaveBeenCalledWith(
      'org-test',
      'max_users',
      1,
      expect.anything(),
    );
    // A check after the insert would be decorative — the row would already exist.
    expect(order).toEqual(['quota', 'save']);
  });

  it('propagates a quota breach and never inserts the user', async () => {
    quotas.assertWithinQuota.mockRejectedValue(new ConflictException({ reason: 'quota_exceeded' }));
    await expect(service.create(dto(), actor(Role.ADMIN))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('charges nothing for an org-less self-registration (no actor)', async () => {
    await service.create(dto());
    expect(quotas.assertWithinQuota).toHaveBeenCalledWith(null, 'max_users', 1, expect.anything());
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

describe('UsersService.verifyPassword', () => {
  const service = new UsersService(
    { findOne: jest.fn() } as unknown as Repository<User>,
    noQuota() as unknown as ConstructorParameters<typeof UsersService>[1],
  );

  it('returns false for an account with no local hash (never calls argon2)', async () => {
    // An invited-but-unaccepted account has passwordHash NULL. argon2.verify on a
    // null hash throws, so the guard has to come first.
    await expect(service.verifyPassword({ passwordHash: null } as User, 'x')).resolves.toBe(false);
  });
});
