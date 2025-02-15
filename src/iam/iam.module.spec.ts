import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { Users } from '@users/entities/users.entity';

import { SubappsService } from '@subapps/subapps.service';

import { OblBusinesses } from '@onlybizlinks/entities/oblBusinesses.entity';
import { OblUsersAndBusinesses } from '@onlybizlinks/entities/oblUsersAndBusinesses.entity';

import { AuthenticationService } from './authentication/authentication.service';
import { AccessTokenGuard } from './authentication/guards/access-token/access-token.guard';
import { RefreshTokens } from './authentication/refresh-token-storage/refresh-token-storage.entity';
import { RefreshTokensService } from './authentication/refresh-token-storage/refresh-token-storage.service';
import { GoogleAuthenticationService } from './authentication/social/google-authentication.service';
import jwtConfig from './config/jwt.config';
import { BcryptService } from './hashing/bcrypt.service';
import { HashingService } from './hashing/hashing.service';
import { IamModule } from './iam.module';

const mockRepository = {
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
};

describe('IamModule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should compile the module', async () => {
    const module = await Test.createTestingModule({
      imports: [
        IamModule,
        ConfigModule.forRoot({
          load: [jwtConfig],
        }),
        JwtModule.register({}),
      ],
    })
      .overrideProvider(getRepositoryToken(Users))
      .useValue(mockRepository)
      .overrideProvider(getRepositoryToken(RefreshTokens))
      .useValue(mockRepository)
      .overrideProvider(getRepositoryToken(OblUsersAndBusinesses))
      .useValue(mockRepository)
      .overrideProvider(getRepositoryToken(OblBusinesses))
      .useValue(mockRepository)
      .compile();

    expect(module).toBeDefined();
  });

  it('should provide HashingService as BcryptService', async () => {
    const module = await Test.createTestingModule({
      imports: [
        IamModule,
        ConfigModule.forRoot({
          load: [jwtConfig],
        }),
        JwtModule.register({}),
      ],
    })
      .overrideProvider(getRepositoryToken(Users))
      .useValue(mockRepository)
      .overrideProvider(getRepositoryToken(RefreshTokens))
      .useValue(mockRepository)
      .overrideProvider(getRepositoryToken(OblUsersAndBusinesses))
      .useValue(mockRepository)
      .overrideProvider(getRepositoryToken(OblBusinesses))
      .useValue(mockRepository)
      .compile();

    const hashingService = module.get<HashingService>(HashingService);
    expect(hashingService).toBeInstanceOf(BcryptService);
  });

  it('should provide all required services', async () => {
    const module = await Test.createTestingModule({
      imports: [
        IamModule,
        ConfigModule.forRoot({
          load: [jwtConfig],
        }),
        JwtModule.register({}),
      ],
    })
      .overrideProvider(getRepositoryToken(Users))
      .useValue(mockRepository)
      .overrideProvider(getRepositoryToken(RefreshTokens))
      .useValue(mockRepository)
      .overrideProvider(getRepositoryToken(OblUsersAndBusinesses))
      .useValue(mockRepository)
      .overrideProvider(getRepositoryToken(OblBusinesses))
      .useValue(mockRepository)
      .compile();

    expect(module.get(AuthenticationService)).toBeDefined();
    expect(module.get(AccessTokenGuard)).toBeDefined();
    expect(module.get(RefreshTokensService)).toBeDefined();
    expect(module.get(GoogleAuthenticationService)).toBeDefined();
    expect(module.get(SubappsService)).toBeDefined();
  });

  it('should configure JWT module with async options', async () => {
    const module = await Test.createTestingModule({
      imports: [
        IamModule,
        ConfigModule.forRoot({
          load: [jwtConfig],
        }),
        JwtModule.register({}),
      ],
    })
      .overrideProvider(getRepositoryToken(Users))
      .useValue(mockRepository)
      .overrideProvider(getRepositoryToken(RefreshTokens))
      .useValue(mockRepository)
      .overrideProvider(getRepositoryToken(OblUsersAndBusinesses))
      .useValue(mockRepository)
      .overrideProvider(getRepositoryToken(OblBusinesses))
      .useValue(mockRepository)
      .compile();

    const jwtService = module.get(JwtModule);
    expect(jwtService).toBeDefined();
  });
});

jest.mock('@users/entities/users.entity', () => ({
  Users: class MockUsers {},
}));

jest.mock(
  './authentication/refresh-token-storage/refresh-token-storage.entity',
  () => ({
    RefreshTokens: class MockRefreshTokens {},
  }),
);

jest.mock('@onlybizlinks/entities/oblUsersAndBusinesses.entity', () => ({
  OblUsersAndBusinesses: class MockOblUsersAndBusinesses {},
}));

jest.mock('@onlybizlinks/entities/oblBusinesses.entity', () => ({
  OblBusinesses: class MockOblBusinesses {},
}));
