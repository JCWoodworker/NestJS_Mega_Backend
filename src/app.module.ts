import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { IamModule } from './iam/iam.module';
import * as Joi from '@hapi/joi';
import appConfig from './config/app.config';
import authConfig from './config/auth.config';
import { APP_GUARD } from '@nestjs/core';
import { RolesGuard } from './iam/authorization/guards/roles.guard';
import { AuthenticationGuard } from './iam/authentication/guards/authentication/authentication.guard';
import { AccessTokenGuard } from './iam/authentication/guards/access-token/access-token.guard';
import { JwtModule } from '@nestjs/jwt';
import jwtConfig from './iam/config/jwt.config';

@Module({
  imports: [
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
