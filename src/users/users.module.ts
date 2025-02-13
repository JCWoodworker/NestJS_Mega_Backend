import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from '@users/users.service';
import { UserController } from '@users/users.controller';
import { Users } from '@users/entities/users.entity';
import { ConfigModule } from '@nestjs/config';
import authConfig from '@config/auth.config';
import { OblUsersAndBusinesses } from '@onlybizlinks/entities/oblUsersAndBusinesses.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Users, OblUsersAndBusinesses]),
    ConfigModule.forFeature(authConfig),
  ],
  controllers: [UserController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
