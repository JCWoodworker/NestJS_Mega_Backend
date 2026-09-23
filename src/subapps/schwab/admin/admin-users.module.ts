import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Users } from '@users/entities/users.entity';

import { RefreshTokens } from '@iam/authentication/refresh-token-storage/refresh-token-storage.entity';
import jwtConfig from '@iam/config/jwt.config';
import emailConfig from '@iam/email/email.config';
import { EmailService } from '@iam/email/email.service';

import { SchwabToken } from '@schwab/auth/entities/schwab-token.entity';
import { BotCapitalEvent } from '@schwab/bot/entities/bot-capital-event.entity';
import { BotDailyReport } from '@schwab/bot/entities/bot-daily-report.entity';
import { BotEvent } from '@schwab/bot/entities/bot-event.entity';
import { BotSettings } from '@schwab/bot/entities/bot-settings.entity';
import { BotState } from '@schwab/bot/entities/bot-state.entity';
import { BotTrade } from '@schwab/bot/entities/bot-trade.entity';
import { BotTradeTape } from '@schwab/bot/entities/bot-trade-tape.entity';
import { SchwabDailyPnl } from '@schwab/pnl/entities/schwab-daily-pnl.entity';
import { SchwabOrderHistory } from '@schwab/pnl/entities/schwab-order-history.entity';
import { SchwabOrderSourceTag } from '@schwab/pnl/entities/schwab-order-source-tag.entity';
import { SchwabRealizedTrade } from '@schwab/pnl/entities/schwab-realized-trade.entity';
import { SchwabTradeFill } from '@schwab/pnl/entities/schwab-trade-fill.entity';
import { SchwabTransaction } from '@schwab/pnl/entities/schwab-transaction.entity';

import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [
    ConfigModule.forFeature(emailConfig),
    ConfigModule.forFeature(jwtConfig),
    JwtModule.registerAsync(jwtConfig.asProvider()),
    TypeOrmModule.forFeature([
      Users,
      SchwabToken,
      BotState,
      BotSettings,
      BotTrade,
      BotTradeTape,
      BotEvent,
      BotCapitalEvent,
      BotDailyReport,
      SchwabRealizedTrade,
      SchwabTransaction,
      SchwabTradeFill,
      SchwabDailyPnl,
      SchwabOrderHistory,
      SchwabOrderSourceTag,
      RefreshTokens,
    ]),
  ],
  controllers: [AdminUsersController],
  providers: [AdminUsersService, EmailService],
  exports: [AdminUsersService],
})
export class AdminUsersModule {}
