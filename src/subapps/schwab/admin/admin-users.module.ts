import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Users } from '@users/entities/users.entity';

import { SchwabToken } from '@schwab/auth/entities/schwab-token.entity';
import { BotState } from '@schwab/bot/entities/bot-state.entity';
import { SchwabRealizedTrade } from '@schwab/pnl/entities/schwab-realized-trade.entity';

import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Users,
      SchwabToken,
      BotState,
      SchwabRealizedTrade,
    ]),
  ],
  controllers: [AdminUsersController],
  providers: [AdminUsersService],
})
export class AdminUsersModule {}
