import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { SchwabToken } from '@schwab/auth/entities/schwab-token.entity';
import { SchwabDailyPnl } from '@schwab/pnl/entities/schwab-daily-pnl.entity';
import { SchwabOrderHistory } from '@schwab/pnl/entities/schwab-order-history.entity';
import { SchwabOrderSourceTag } from '@schwab/pnl/entities/schwab-order-source-tag.entity';
import { SchwabRealizedTrade } from '@schwab/pnl/entities/schwab-realized-trade.entity';
import { SchwabTradeFill } from '@schwab/pnl/entities/schwab-trade-fill.entity';
import { SchwabTransaction } from '@schwab/pnl/entities/schwab-transaction.entity';

import { OptionsGateway } from './options.gateway';
import { SchwabStreamerPool } from './schwab-streamer-pool.service';
import { SchwabStreamingModule } from './schwab-streaming.module';

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
 * Boot guard for the gateway/pool cycle: the gateway needs the pool to
 * acquire sessions, and the pool needs the gateway to emit into rooms. Both
 * ends use forwardRef, which type-checks either way — only resolving the
 * graph proves it works, and a failure here would otherwise appear as a dyno
 * crash on deploy.
 */
describe('SchwabStreamingModule dependency graph', () => {
  it('resolves the gateway/pool cycle', async () => {
    const builder = Test.createTestingModule({
      imports: [SchwabStreamingModule],
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

    expect(moduleRef.get(SchwabStreamerPool)).toBeInstanceOf(
      SchwabStreamerPool,
    );
    expect(moduleRef.get(OptionsGateway)).toBeInstanceOf(OptionsGateway);

    await moduleRef.close();
  });

  it('starts no streamer sessions until a client connects', async () => {
    const builder = Test.createTestingModule({
      imports: [SchwabStreamingModule],
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
    await moduleRef.init();

    // Previously the streamer connected in onModuleInit. Sessions are now
    // lazy, so booting must not open a Schwab socket for anybody.
    expect(moduleRef.get(SchwabStreamerPool).activeUserIds()).toEqual([]);

    await moduleRef.close();
  });
});
