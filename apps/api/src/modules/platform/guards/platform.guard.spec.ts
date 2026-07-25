import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Role } from '../../../common/enums/role.enum';
import { UsersService } from '../../users/users.service';
import { PlatformGuard } from './platform.guard';

function makeCtx(user: unknown) {
  const request: Record<string, unknown> = { user };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('PlatformGuard', () => {
  let users: { findById: jest.Mock };
  let guard: PlatformGuard;

  beforeEach(() => {
    users = { findById: jest.fn() };
    guard = new PlatformGuard(users as unknown as UsersService);
  });

  it('allows an active SUPERADMIN with no org and stamps isPlatformScope', async () => {
    users.findById.mockResolvedValue({
      id: 'sa',
      role: Role.SUPERADMIN,
      organizationId: null,
      isActive: true,
    });
    const { context, request } = makeCtx({ id: 'sa' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.isPlatformScope).toBe(true);
    expect(users.findById).toHaveBeenCalledWith('sa');
  });

  it('rejects an unauthenticated request', async () => {
    const { context } = makeCtx(undefined);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(users.findById).not.toHaveBeenCalled();
  });

  it('rejects an ADMIN even when the token claims superadmin (fresh DB is authoritative)', async () => {
    users.findById.mockResolvedValue({
      id: 'a',
      role: Role.ADMIN,
      organizationId: 'org-1',
      isActive: true,
    });
    const { context } = makeCtx({ id: 'a', role: Role.SUPERADMIN }); // stale/forged token
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a SUPERADMIN that still carries an org', async () => {
    users.findById.mockResolvedValue({
      id: 'sa',
      role: Role.SUPERADMIN,
      organizationId: 'org-1',
      isActive: true,
    });
    await expect(guard.canActivate(makeCtx({ id: 'sa' }).context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects an inactive SUPERADMIN', async () => {
    users.findById.mockResolvedValue({
      id: 'sa',
      role: Role.SUPERADMIN,
      organizationId: null,
      isActive: false,
    });
    await expect(guard.canActivate(makeCtx({ id: 'sa' }).context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects when the user no longer exists in the DB', async () => {
    users.findById.mockResolvedValue(null);
    await expect(guard.canActivate(makeCtx({ id: 'gone' }).context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
