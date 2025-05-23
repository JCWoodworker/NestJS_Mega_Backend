import * as Joi from '@hapi/joi';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, RouterModule } from '@nestjs/core';
import { DevtoolsModule } from '@nestjs/devtools-integration';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsersModule } from '@users/users.module';

import appConfig from '@config/app.config';
import authConfig from '@config/auth.config';

import { AccessTokenGuard } from '@iam/authentication/guards/access-token/access-token.guard';
import { AuthenticationGuard } from '@iam/authentication/guards/authentication/authentication.guard';
import { RolesGuard } from '@iam/authorization/guards/roles.guard';
import jwtConfig from '@iam/config/jwt.config';
import { IamModule } from '@iam/iam.module';

import { GeminiModule } from '@gemini/gemini.module';

import { IronviewModule } from '@subapps/ironview/ironview.module';
import { MycuttingboardModule } from '@subapps/mycuttingboard/mycuttingboard.module';
import { OnlyBizlinksModule } from '@subapps/onlybizlinks/onlybizlinks.module';
import { SubappsModule } from '@subapps/subapps.module';

import { ScrapersModule } from '@scrapers/scrapers.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    DevtoolsModule.register({
      http: process.env.ENVIRONMENT !== 'development',
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, authConfig],
      validationSchema: Joi.object({
        ENVIRONMENT: Joi.string().required(),
        DATABASE_URL: Joi.string().required(),
      }),
    }),
    ConfigModule.forFeature(jwtConfig),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        autoLoadEntities: true,
      }),
    }),
    JwtModule.registerAsync(jwtConfig.asProvider()),
    UsersModule,
    IamModule,
    GeminiModule,
    SubappsModule,
    ScrapersModule,
    RouterModule.register([
      {
        path: 'users',
        module: UsersModule,
      },
      {
        path: 'authentication',
        module: IamModule,
      },
      {
        path: 'ai',
        module: GeminiModule,
      },
      {
        path: 'scrapers',
        module: ScrapersModule,
      },
      {
        path: 'subapps',
        module: SubappsModule,
        children: [
          {
            path: 'mycuttingboard',
            module: MycuttingboardModule,
          },
          {
            path: 'onlybizlinks',
            module: OnlyBizlinksModule,
          },
          {
            path: 'ironview',
            module: IronviewModule,
          },
        ],
      },
    ]),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: 10,
        },
      ],
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AuthenticationGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    AccessTokenGuard,
  ],
})
export class AppModule {}
