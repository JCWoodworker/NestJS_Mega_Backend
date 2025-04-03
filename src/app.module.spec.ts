import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';

import { UsersModule } from '@users/users.module';

import appConfig from '@config/app.config';
import authConfig from '@config/auth.config';

import { AccessTokenGuard } from '@iam/authentication/guards/access-token/access-token.guard';
// import { AuthenticationGuard } from '@iam/authentication/guards/authentication/authentication.guard';
import { RefreshTokens } from '@iam/authentication/refresh-token-storage/refresh-token-storage.entity';
// import { RolesGuard } from '@iam/authorization/guards/roles.guard';
import { IamModule } from '@iam/iam.module';

import { GeminiModule } from '@gemini/gemini.module';

import { SubappsModule } from '@subapps/subapps.module';

import { ScrapersModule } from '@scrapers/scrapers.module';

import { AppController } from './app.controller';
import { AppModule } from './app.module';
import { AppService } from './app.service';

jest.mock('@nestjs/typeorm', () => {
  const originalModule = jest.requireActual('@nestjs/typeorm');
  return {
    ...originalModule,
    TypeOrmModule: {
      forRoot: jest.fn().mockReturnValue({
        module: class TypeOrmModule {},
        providers: [],
      }),
      forRootAsync: jest.fn().mockReturnValue({
        module: class TypeOrmModule {},
        providers: [],
      }),
      forFeature: jest.fn().mockReturnValue({
        module: class TypeOrmModule {},
        providers: [],
      }),
    },
  };
});

describe('AppModule', () => {
  let module: any;

  beforeEach(async () => {
    process.env.ENVIRONMENT = 'test';
    process.env.DATABASE_URL = 'mock://database-url';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getDataSourceToken())
      .useValue({
        createQueryRunner: jest.fn().mockReturnValue({
          connect: jest.fn(),
          startTransaction: jest.fn(),
          commitTransaction: jest.fn(),
          rollbackTransaction: jest.fn(),
          release: jest.fn(),
        }),
      })
      .overrideProvider(getRepositoryToken(RefreshTokens))
      .useValue({
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(null),
        save: jest
          .fn()
          .mockImplementation((entity) =>
            Promise.resolve({ id: 1, ...entity }),
          ),
        create: jest
          .fn()
          .mockImplementation((entity) => ({ id: 1, ...entity })),
        delete: jest.fn().mockResolvedValue({ affected: 1 }),
      })
      .useMocker((token) => {
        if (token?.toString().includes('Repository')) {
          return {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            save: jest
              .fn()
              .mockImplementation((entity) =>
                Promise.resolve({ id: 1, ...entity }),
              ),
            create: jest
              .fn()
              .mockImplementation((entity) => ({ id: 1, ...entity })),
            delete: jest.fn().mockResolvedValue({ affected: 1 }),
          };
        }
        if (token === APP_GUARD) {
          return {
            canActivate: jest.fn().mockResolvedValue(true),
          };
        }
        return undefined;
      })
      .compile();

    module = moduleRef;
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should have all required providers', () => {
    const appService = module.get(AppService);
    const accessTokenGuard = module.get(AccessTokenGuard);

    expect(appService).toBeDefined();
    expect(accessTokenGuard).toBeDefined();
  });

  // it('should have all required guards', async () => {
  //   const authGuard = await module.resolve(AuthenticationGuard);
  //   const rolesGuard = await module.resolve(RolesGuard);

  //   expect(authGuard).toBeDefined();
  //   expect(rolesGuard).toBeDefined();
  // });

  it('should have ConfigModule configured correctly', () => {
    const configModule = module.get(ConfigModule);
    expect(configModule).toBeDefined();

    const loadedConfig = module.get(appConfig.KEY);
    expect(loadedConfig).toBeDefined();

    const loadedAuthConfig = module.get(authConfig.KEY);
    expect(loadedAuthConfig).toBeDefined();
  });

  // it('should have TypeOrmModule configured correctly', () => {
  //   const dataSource = module.get(getDataSourceToken());
  //   expect(dataSource).toBeDefined();
  //   expect(dataSource.createQueryRunner).toBeDefined();
  // });

  it('should have required feature modules', () => {
    const usersModule = module.get(UsersModule);
    const iamModule = module.get(IamModule);
    const geminiModule = module.get(GeminiModule);
    const subappsModule = module.get(SubappsModule);
    const scrapersModule = module.get(ScrapersModule);
    expect(usersModule).toBeDefined();
    expect(iamModule).toBeDefined();
    expect(geminiModule).toBeDefined();
    expect(subappsModule).toBeDefined();
    expect(scrapersModule).toBeDefined();
  });

  it('should have AppController defined', () => {
    const controller = module.get(AppController);
    expect(controller).toBeDefined();
  });

  afterEach(() => {
    delete process.env.ENVIRONMENT;
    delete process.env.DATABASE_URL;
    jest.clearAllMocks();
  });
});
