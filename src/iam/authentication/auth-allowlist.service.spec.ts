import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import authConfig from '@config/auth.config';

import { Role } from '@users/enums/role.enum';

import { AuthAllowlistService } from './auth-allowlist.service';
import { AuthAllowedEmail } from '../entities/auth-allowed-email.entity';

describe('AuthAllowlistService', () => {
  const allowedRepository = {
    findOneBy: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    save: jest.fn(),
    create: jest.fn((row) => row),
    delete: jest.fn(),
  };

  let service: AuthAllowlistService;

  beforeEach(async () => {
    jest.clearAllMocks();
    allowedRepository.count.mockResolvedValue(1);
    const module = await Test.createTestingModule({
      providers: [
        AuthAllowlistService,
        {
          provide: getRepositoryToken(AuthAllowedEmail),
          useValue: allowedRepository,
        },
        {
          provide: authConfig.KEY,
          useValue: { bootstrapAllowedEmails: ['owner@example.com'] },
        },
      ],
    }).compile();

    service = module.get(AuthAllowlistService);
  });

  it('normalizes email case and whitespace', () => {
    expect(service.normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
  });

  it('assertCanAuthenticate rejects emails not on the allowlist', async () => {
    allowedRepository.findOneBy.mockResolvedValue(null);
    await expect(
      service.assertCanAuthenticate('stranger@example.com'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('assertCanAuthenticate rejects locked users even when allowlisted', async () => {
    allowedRepository.findOneBy.mockResolvedValue({
      email: 'owner@example.com',
    });
    await expect(
      service.assertCanAuthenticate('owner@example.com', {
        id: '1',
        email: 'owner@example.com',
        isLocked: true,
        role: Role.Admin,
      } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('assertCanAuthenticate allows unlocked allowlisted users', async () => {
    allowedRepository.findOneBy.mockResolvedValue({
      email: 'owner@example.com',
    });
    await expect(
      service.assertCanAuthenticate('owner@example.com', {
        id: '1',
        email: 'owner@example.com',
        isLocked: false,
        role: Role.Admin,
      } as any),
    ).resolves.toBeUndefined();
  });

  it('seeds bootstrap emails only when the table is empty', async () => {
    allowedRepository.count.mockResolvedValue(0);
    allowedRepository.save.mockImplementation(async (row) => row);

    const module = await Test.createTestingModule({
      providers: [
        AuthAllowlistService,
        {
          provide: getRepositoryToken(AuthAllowedEmail),
          useValue: allowedRepository,
        },
        {
          provide: authConfig.KEY,
          useValue: {
            bootstrapAllowedEmails: ['a@example.com', 'b@example.com'],
          },
        },
      ],
    }).compile();

    await module.init();

    expect(allowedRepository.save).toHaveBeenCalledTimes(2);
    expect(allowedRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@example.com', note: 'bootstrap' }),
    );
  });
});
