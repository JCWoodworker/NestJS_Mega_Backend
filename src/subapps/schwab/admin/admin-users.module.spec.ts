import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { Users } from '@users/entities/users.entity';

import { SchwabToken } from '@schwab/auth/entities/schwab-token.entity';
import { BotState } from '@schwab/bot/entities/bot-state.entity';
import { SchwabRealizedTrade } from '@schwab/pnl/entities/schwab-realized-trade.entity';

import { AdminUsersController } from './admin-users.controller';
import { AdminUsersModule } from './admin-users.module';
import { AdminUsersService } from './admin-users.service';

const mockRepository = {
  find: jest.fn().mockResolvedValue([]),
};

/** Guards against the module compiling in isolation via `tsc` while the
 * actual Nest DI graph fails to resolve at boot — this caught nothing new
 * itself, but it's the same class of gap that already bit this app once on
 * `RouterModule`'s path-prefixing requirements. */
describe('AdminUsersModule', () => {
  it('resolves its controller and service from the DI container', async () => {
    const module = await Test.createTestingModule({
      imports: [AdminUsersModule],
    })
      .overrideProvider(getRepositoryToken(Users))
      .useValue(mockRepository)
      .overrideProvider(getRepositoryToken(SchwabToken))
      .useValue(mockRepository)
      .overrideProvider(getRepositoryToken(BotState))
      .useValue(mockRepository)
      .overrideProvider(getRepositoryToken(SchwabRealizedTrade))
      .useValue(mockRepository)
      .compile();

    expect(module.get(AdminUsersService)).toBeInstanceOf(AdminUsersService);
    expect(module.get(AdminUsersController)).toBeInstanceOf(
      AdminUsersController,
    );
  });
});
