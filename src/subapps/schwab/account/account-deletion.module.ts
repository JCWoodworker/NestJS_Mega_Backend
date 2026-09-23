import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Users } from '@users/entities/users.entity';

import { AdminUsersModule } from '@schwab/admin/admin-users.module';

import { AccountDeletionRequest } from './account-deletion-request.entity';
import { AccountDeletionController } from './account-deletion.controller';
import { AccountDeletionService } from './account-deletion.service';
import { AdminDeletionController } from './admin-deletion.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccountDeletionRequest, Users]),
    AdminUsersModule,
  ],
  controllers: [AccountDeletionController, AdminDeletionController],
  providers: [AccountDeletionService],
})
export class AccountDeletionModule {}
