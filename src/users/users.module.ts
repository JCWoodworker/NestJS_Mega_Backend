import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Users } from '@users/entities/users.entity';
import { UserController } from '@users/users.controller';
import { UsersService } from '@users/users.service';

import authConfig from '@config/auth.config';

import { RefreshTokensModule } from '@iam/authentication/refresh-token-storage/refresh-token-storage.module';

import { OblUsersAndBusinesses } from '@onlybizlinks/entities/oblUsersAndBusinesses.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Users, OblUsersAndBusinesses]),
    ConfigModule.forFeature(authConfig),
    RefreshTokensModule,
  ],
  controllers: [UserController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
