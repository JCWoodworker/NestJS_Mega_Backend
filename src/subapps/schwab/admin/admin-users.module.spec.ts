import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
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
import { AdminUsersModule } from './admin-users.module';
import { AdminUsersService } from './admin-users.service';

const mockRepository = {
  find: jest.fn().mockResolvedValue([]),
  findOneBy: jest.fn().mockResolvedValue(null),
  count: jest.fn().mockResolvedValue(0),
  delete: jest.fn().mockResolvedValue({ affected: 0 }),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
};

const entities = [
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
];

describe('AdminUsersModule', () => {
  it('resolves its controller and service from the DI container', async () => {
    let builder = Test.createTestingModule({
      imports: [AdminUsersModule],
    });
    for (const entity of entities) {
      builder = builder
        .overrideProvider(getRepositoryToken(entity))
        .useValue(mockRepository);
    }
    const module = await builder
      .overrideProvider(EmailService)
      .useValue({
        sendAccountExportEmail: jest.fn(),
        sendVerificationEmail: jest.fn(),
      })
      .compile();

    expect(module.get(AdminUsersService)).toBeInstanceOf(AdminUsersService);
    expect(module.get(AdminUsersController)).toBeInstanceOf(
      AdminUsersController,
    );
  });
});
