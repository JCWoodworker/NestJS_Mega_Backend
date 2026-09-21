import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Role } from '@users/enums/role.enum';

import { REQUEST_USER_KEY } from '@iam/iam.constants';

import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;
  let usersService: { findOneById: jest.Mock };
  let mockContext: ExecutionContext;

  /** The stored account, which is what the guard trusts over the JWT claim. */
  function storedUser(role: Role, isLocked = false) {
    return { id: 'user-1', email: 'a@b.com', role, isLocked };
  }

  function requestWith(user: Record<string, unknown>) {
    jest
      .spyOn(mockContext.switchToHttp(), 'getRequest')
      .mockReturnValue({ [REQUEST_USER_KEY]: user });
  }

  beforeEach(() => {
    reflector = new Reflector();
    usersService = { findOneById: jest.fn() };
    guard = new RolesGuard(reflector, usersService as never);

    mockContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({}),
      }),
    } as unknown as ExecutionContext;
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow access when no roles are defined', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    await expect(guard.canActivate(mockContext)).resolves.toBe(true);
  });

  it('does not query the database for unguarded routes', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    await guard.canActivate(mockContext);

    expect(usersService.findOneById).not.toHaveBeenCalled();
  });

  it('should allow access when user has required role', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.Admin]);
    requestWith({ sub: 'user-1', role: Role.Admin });
    usersService.findOneById.mockResolvedValue(storedUser(Role.Admin));

    await expect(guard.canActivate(mockContext)).resolves.toBe(true);
  });

  it('should deny access when user does not have required role', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.Admin]);
    requestWith({ sub: 'user-1', role: Role.Basic });
    usersService.findOneById.mockResolvedValue(storedUser(Role.Basic));

    await expect(guard.canActivate(mockContext)).resolves.toBe(false);
  });

  it('should allow access when user has one of multiple required roles', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.Basic, Role.Admin]);
    requestWith({ sub: 'user-1', role: Role.Admin });
    usersService.findOneById.mockResolvedValue(storedUser(Role.Admin));

    await expect(guard.canActivate(mockContext)).resolves.toBe(true);
  });

  it('denies a token claiming admin once the account has been demoted', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.Admin]);
    requestWith({ sub: 'user-1', role: Role.Admin });
    usersService.findOneById.mockResolvedValue(storedUser(Role.Basic));

    await expect(guard.canActivate(mockContext)).resolves.toBe(false);
  });

  it('denies a locked admin', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.Admin]);
    requestWith({ sub: 'user-1', role: Role.Admin });
    usersService.findOneById.mockResolvedValue(storedUser(Role.Admin, true));

    await expect(guard.canActivate(mockContext)).resolves.toBe(false);
  });

  it('denies when the account no longer exists', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.Admin]);
    requestWith({ sub: 'user-1', role: Role.Admin });
    usersService.findOneById.mockRejectedValue(new Error('not found'));

    await expect(guard.canActivate(mockContext)).resolves.toBe(false);
  });

  it('denies a request with no resolved user', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.Admin]);

    await expect(guard.canActivate(mockContext)).resolves.toBe(false);
  });
});
