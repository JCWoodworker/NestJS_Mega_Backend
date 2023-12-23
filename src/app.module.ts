import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { UsersModule } from './users/users.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { IamModule } from './iam/iam.module';
import * as Joi from '@hapi/joi';
import appConfig from './config/app.config';
import authConfig from './config/auth.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, authConfig],
      validationSchema: Joi.object({
        ENVIRONMENT: Joi.string().required(),
        DATABASE_URL: Joi.string().required(),
        SALT_ROUNDS: Joi.number().required().default(10),
      }),
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        autoLoadEntities: true,
      }),
    }),
    UsersModule,
    IamModule,
  ],
  controllers: [AppController],
  providers: [
    //   AppService,
    //   {
    //     provide: APP_GUARD,
    //     useClass: AuthGuard,
    //   },
  ],
})
export class AppModule {}
