import { ConflictException } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { LEGACY_ORG_ID } from '../organizations/organizations.constants';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

type MockRepo = {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};

/** A QueryFailedError carrying a pg driver error code (as the real driver does). */
function pgError(code: string): QueryFailedError {
  const driver = Object.assign(new Error(`pg ${code}`), { code });
  return new QueryFailedError('INSERT', [], driver as unknown as Error);
}

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

describe('UsersService — Clerk identity (#51)', () => {
  let repo: MockRepo;
  let service: UsersService;

  beforeEach(() => {
    repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data) => data),
      save: jest.fn((entity) => Promise.resolve({ ...entity, id: 'new-id' } as User)),
    };
    service = new UsersService(repo as unknown as Repository<User>);
  });

  describe('findByClerkId', () => {
    it('looks up by the clerk_user_id column', async () => {
      const row = { id: 'u1', clerkUserId: 'user_abc' } as User;
      repo.findOne.mockResolvedValueOnce(row);
      await expect(service.findByClerkId('user_abc')).resolves.toBe(row);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { clerkUserId: 'user_abc' } });
    });
  });

  describe('upsertFromClerk', () => {
    const input = { clerkUserId: 'user_abc', email: 'Case@X.dev', firstName: 'A', lastName: 'B' };

    it('returns the already-linked row untouched (DB authoritative for role/org)', async () => {
      const linked = { id: 'u1', clerkUserId: 'user_abc', role: Role.ADMIN } as User;
      repo.findOne.mockResolvedValueOnce(linked); // findByClerkId hit
      const out = await service.upsertFromClerk(input);
      expect(out).toBe(linked);
      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('links an existing legacy row that owns the email rather than inserting a duplicate', async () => {
      const byEmail = { id: 'u2', email: 'case@x.dev', clerkUserId: null } as User;
      repo.findOne
        .mockResolvedValueOnce(null) // findByClerkId miss
        .mockResolvedValueOnce(byEmail); // find by email hit
      const out = await service.upsertFromClerk(input);
      expect(out.clerkUserId).toBe('user_abc');
      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalledWith(byEmail);
    });

    it('creates a STUDENT in the Legacy org with a null passwordHash on first sight', async () => {
      const out = await service.upsertFromClerk(input); // both findOne calls miss
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'case@x.dev', // lowercased
          role: Role.STUDENT,
          organizationId: LEGACY_ORG_ID,
          clerkUserId: 'user_abc',
          passwordHash: null,
        }),
      );
      expect(out.id).toBe('new-id');
    });

    it('is race-safe: re-reads the winner when the insert hits 23505 on the clerk-id index', async () => {
      const winner = { id: 'u3', clerkUserId: 'user_abc' } as User;
      repo.findOne
        .mockResolvedValueOnce(null) // findByClerkId miss
        .mockResolvedValueOnce(null) // email miss
        .mockResolvedValueOnce(winner); // re-find after the race
      repo.save.mockRejectedValueOnce(pgError('23505'));
      await expect(service.upsertFromClerk(input)).resolves.toBe(winner);
    });

    it('rethrows a non-23505 save failure', async () => {
      const err = pgError('23502');
      repo.save.mockRejectedValueOnce(err);
      await expect(service.upsertFromClerk(input)).rejects.toBe(err);
    });
  });

  describe('verifyPassword', () => {
    it('returns false for a Clerk-managed account with no local hash (never calls argon2)', async () => {
      await expect(service.verifyPassword({ passwordHash: null } as User, 'x')).resolves.toBe(
        false,
      );
    });
  });
});
