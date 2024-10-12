import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ConfigModule } from '@nestjs/config';
import appConfig from './config/app.config';
import authConfig from './config/auth.config';

import { UsersModule } from './users/users.module';
import { IamModule } from './iam/iam.module';
import { SubappsModule } from './subapps/subapps.module';
import { MycuttingboardModule } from './subapps/mycuttingboard/mycuttingboard.module';
import { MyrestaurantlinksModule } from './subapps/myrestaurantlinks/myrestaurantlinks.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { JwtModule } from '@nestjs/jwt';
import jwtConfig from './iam/config/jwt.config';

import * as Joi from '@hapi/joi';

import { APP_GUARD, RouterModule } from '@nestjs/core';
import { RolesGuard } from './iam/authorization/guards/roles.guard';
import { AuthenticationGuard } from './iam/authentication/guards/authentication/authentication.guard';
import { AccessTokenGuard } from './iam/authentication/guards/access-token/access-token.guard';
import { DevtoolsModule } from '@nestjs/devtools-integration';
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
    SubappsModule,
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
        path: 'subapps',
        module: SubappsModule,
        children: [
          {
            path: 'mycuttingboard',
            module: MycuttingboardModule,
          },
          {
            path: 'myrestaurantlinks',
            module: MyrestaurantlinksModule,
          },
        ],
      },
    ]),
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
