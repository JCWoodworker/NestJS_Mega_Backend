import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { SchwabToken } from '@schwab/auth/entities/schwab-token.entity';
import { SchwabDailyPnl } from '@schwab/pnl/entities/schwab-daily-pnl.entity';
import { SchwabOrderHistory } from '@schwab/pnl/entities/schwab-order-history.entity';
import { SchwabOrderSourceTag } from '@schwab/pnl/entities/schwab-order-source-tag.entity';
import { SchwabRealizedTrade } from '@schwab/pnl/entities/schwab-realized-trade.entity';
import { SchwabTradeFill } from '@schwab/pnl/entities/schwab-trade-fill.entity';
import { SchwabTransaction } from '@schwab/pnl/entities/schwab-transaction.entity';

import { SchwabAccountResolver } from './schwab-account-resolver.service';
import { SchwabSharedModule } from './schwab-shared.module';

const ENTITIES = [
  SchwabToken,
  SchwabTransaction,
  SchwabTradeFill,
  SchwabRealizedTrade,
  SchwabDailyPnl,
  SchwabOrderHistory,
  SchwabOrderSourceTag,
];

/**
 * Boot-time regression guard for the module cycle this refactor introduced:
 * SchwabSharedModule -> OrdersModule -> PnlModule -> SchwabSharedModule.
 *
 * `yarn build` type-checks the imports but says nothing about whether Nest
 * can actually resolve the graph, and an unresolvable cycle fails at dyno
 * start rather than in CI. Compiling the module here catches that.
 */
describe('SchwabSharedModule dependency graph', () => {
  it('resolves despite the orders/pnl/shared cycle', async () => {
    const builder = Test.createTestingModule({
      imports: [SchwabSharedModule],
    });

    for (const entity of ENTITIES) {
      builder.overrideProvider(getRepositoryToken(entity)).useValue({
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(null),
        findOneBy: jest.fn().mockResolvedValue(null),
        save: jest.fn(),
        delete: jest.fn(),
      });
    }

    const moduleRef = await builder.compile();

    expect(moduleRef.get(SchwabAccountResolver)).toBeInstanceOf(
      SchwabAccountResolver,
    );

    await moduleRef.close();
  });
});
