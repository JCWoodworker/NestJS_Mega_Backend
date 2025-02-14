import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Role } from '@users/enums/role.enum';

import { REQUEST_USER_KEY } from '@iam/iam.constants';

import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);

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

  it('should allow access when no roles are defined', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('should allow access when user has required role', () => {
    const mockUser = { role: Role.Admin };
    const mockRequest = { [REQUEST_USER_KEY]: mockUser };

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.Admin]);
    jest
      .spyOn(mockContext.switchToHttp(), 'getRequest')
      .mockReturnValue(mockRequest);

    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('should deny access when user does not have required role', () => {
    const mockUser = { role: Role.Basic };
    const mockRequest = { [REQUEST_USER_KEY]: mockUser };

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.Admin]);
    jest
      .spyOn(mockContext.switchToHttp(), 'getRequest')
      .mockReturnValue(mockRequest);

    expect(guard.canActivate(mockContext)).toBe(false);
  });

  it('should allow access when user has one of multiple required roles', () => {
    const mockUser = { role: Role.Admin };
    const mockRequest = { [REQUEST_USER_KEY]: mockUser };

    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.Basic, Role.Admin]);
    jest
      .spyOn(mockContext.switchToHttp(), 'getRequest')
      .mockReturnValue(mockRequest);

    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('should deny access when user has none of multiple required roles', () => {
    const mockUser = { role: Role.Basic };
    const mockRequest = { [REQUEST_USER_KEY]: mockUser };

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.Admin]);
    jest
      .spyOn(mockContext.switchToHttp(), 'getRequest')
      .mockReturnValue(mockRequest);

    expect(guard.canActivate(mockContext)).toBe(false);
  });
});
