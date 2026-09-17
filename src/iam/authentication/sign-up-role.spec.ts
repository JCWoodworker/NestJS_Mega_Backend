import { BadRequestException, ValidationPipe } from '@nestjs/common';

import { Role } from '@users/enums/role.enum';

import { AuthenticationService } from './authentication.service';
import { SignUpDto } from './dto/sign-up.dto';

/**
 * Locks in "sign-up can never set a role".
 *
 * Nothing today allows it, and that is the point — this file exists so a
 * future DTO field, a `create(dto)` refactor, or a relaxed ValidationPipe
 * cannot quietly open a self-service path to admin. Admin is granted only by
 * `AdminBootstrapService` from config, and capped at one row by
 * `UQ_users_one_admin_only`.
 */
describe('sign-up cannot assign a role', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const metadata = {
    type: 'body' as const,
    metatype: SignUpDto,
  };

  it('rejects a request body carrying a role', async () => {
    expect.assertions(2);
    try {
      await pipe.transform(
        {
          email: 'attacker@example.com',
          password: 'Sup3rStr0ng!pass',
          signUpOrIn: 'signup',
          role: 'admin',
        },
        metadata,
      );
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      // `forbidNonWhitelisted` rejects the request outright rather than
      // silently stripping the field, so an attempt is visible in logs.
      expect(err.getResponse().message).toContain(
        'property role should not exist',
      );
    }
  });

  it('accepts a clean body and produces no role property', async () => {
    const result = await pipe.transform(
      {
        email: 'user@example.com',
        password: 'Sup3rStr0ng!pass',
        signUpOrIn: 'signup',
      },
      metadata,
    );

    expect(result).not.toHaveProperty('role');
    expect(Object.keys(result).sort()).toEqual([
      'email',
      'password',
      'signUpOrIn',
    ]);
  });

  it('never writes a role when creating the user', async () => {
    const usersRepository = {
      save: jest.fn((user) => Promise.resolve({ ...user, id: 'new-id' })),
    };
    const allowlistService = {
      normalizeEmail: (email: string) => email.trim().toLowerCase(),
      assertCanAuthenticate: jest.fn().mockResolvedValue(undefined),
    };
    const hashingService = { hash: jest.fn().mockResolvedValue('hashed') };

    const service = new AuthenticationService(
      usersRepository as any,
      {} as any,
      {} as any,
      {} as any,
      hashingService as any,
      {} as any,
      allowlistService as any,
      {} as any,
    );

    await service.signUp({
      email: 'User@Example.com',
      password: 'Sup3rStr0ng!pass',
      signUpOrIn: 'signup',
    } as SignUpDto);

    const saved = usersRepository.save.mock.calls[0][0];
    // The entity default supplies `basic`; the service must not set the
    // column at all, and must never echo a client-supplied value.
    expect(saved.role).toBeUndefined();
    expect(saved.email).toBe('user@example.com');
    expect(saved.role).not.toBe(Role.Admin);
  });
});
