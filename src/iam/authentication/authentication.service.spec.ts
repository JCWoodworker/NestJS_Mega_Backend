import { UnauthorizedException } from '@nestjs/common';

import { AuthenticationService } from './authentication.service';

const SECRET = 'test-secret';

function build(
  options: {
    user?: Record<string, unknown> | null;
    verifyAsyncImpl?: (token: string) => unknown;
  } = {},
) {
  const usersRepository = {
    findOneBy: jest.fn().mockResolvedValue(options.user ?? null),
    findOneByOrFail: jest.fn().mockImplementation(async () => {
      if (!options.user) throw new Error('not found');
      return options.user;
    }),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('signed-token'),
    verifyAsync: jest.fn().mockImplementation(
      options.verifyAsyncImpl ??
        (async () => {
          throw new Error('no verifyAsync stub provided');
        }),
    ),
  };
  const emailService = { sendVerificationEmail: jest.fn() };

  const service = new AuthenticationService(
    usersRepository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    jwtService as never,
    {} as never,
    emailService as never,
    { secret: SECRET, issuer: undefined, audience: undefined } as never,
  );

  return { service, usersRepository, jwtService, emailService };
}

describe('AuthenticationService — email verification', () => {
  describe('verifyEmail', () => {
    it('marks the user verified on a valid token', async () => {
      const { service, usersRepository } = build({
        user: { id: 'user-1', email: 'a@b.com', isEmailVerified: false },
        verifyAsyncImpl: async () => ({
          sub: 'user-1',
          purpose: 'email-verify',
        }),
      });

      const result = await service.verifyEmail('token');

      expect(result).toEqual({ email: 'a@b.com' });
      expect(usersRepository.update).toHaveBeenCalledWith('user-1', {
        isEmailVerified: true,
      });
    });

    /** Idempotent by design: clicking an old or already-used link twice
     * should not error, since email clients sometimes prefetch links. */
    it('does not re-write an already-verified user', async () => {
      const { service, usersRepository } = build({
        user: { id: 'user-1', email: 'a@b.com', isEmailVerified: true },
        verifyAsyncImpl: async () => ({
          sub: 'user-1',
          purpose: 'email-verify',
        }),
      });

      await service.verifyEmail('token');

      expect(usersRepository.update).not.toHaveBeenCalled();
    });

    it('rejects a token with the wrong purpose', async () => {
      const { service } = build({
        user: { id: 'user-1', email: 'a@b.com', isEmailVerified: false },
        verifyAsyncImpl: async () => ({
          sub: 'user-1',
          purpose: 'password-reset',
        }),
      });

      await expect(service.verifyEmail('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an expired or malformed token', async () => {
      const { service } = build({
        verifyAsyncImpl: async () => {
          throw new Error('jwt expired');
        },
      });

      await expect(service.verifyEmail('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a well-formed token for a user that no longer exists', async () => {
      const { service } = build({
        user: null,
        verifyAsyncImpl: async () => ({
          sub: 'deleted-user',
          purpose: 'email-verify',
        }),
      });

      await expect(service.verifyEmail('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('resendVerificationEmail', () => {
    it('sends a fresh token to an unverified user', async () => {
      const { service, emailService, jwtService } = build({
        user: { id: 'user-1', email: 'a@b.com', isEmailVerified: false },
      });

      const result = await service.resendVerificationEmail('user-1');

      expect(jwtService.signAsync).toHaveBeenCalled();
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        'a@b.com',
        'signed-token',
      );
      expect(result.message).toMatch(/sent/i);
    });

    /** No point re-sending, and it means one less inbox notification for
     * someone who already finished the flow. */
    it('no-ops for an already-verified user without sending mail', async () => {
      const { service, emailService } = build({
        user: { id: 'user-1', email: 'a@b.com', isEmailVerified: true },
      });

      const result = await service.resendVerificationEmail('user-1');

      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
      expect(result.message).toMatch(/already verified/i);
    });
  });

  describe('touchLastLogin', () => {
    it('stamps lastLoginAt for the given user', async () => {
      const { service, usersRepository } = build();

      await service.touchLastLogin('user-1');

      expect(usersRepository.update).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ lastLoginAt: expect.any(Date) }),
      );
    });
  });
});
