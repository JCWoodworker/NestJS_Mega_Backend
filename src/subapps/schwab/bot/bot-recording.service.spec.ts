import { runAsUser } from '@schwab/shared/schwab-user-context';

import { BotRecordingService } from './bot-recording.service';
import { BotCapitalEventReason } from './entities/bot-capital-event.entity';
import { BotLane } from './enums/bot-lane.enum';

const OWNER = 'owner-user-id';

function build(overrides: Record<string, unknown> = {}) {
  const tapeRepository = { insert: jest.fn(), find: jest.fn(() => []) };
  const tradeRepository = { insert: jest.fn(), upsert: jest.fn() };
  const capitalEventRepository = { insert: jest.fn() };

  const service = new BotRecordingService(
    tapeRepository as any,
    tradeRepository as any,
    { insert: jest.fn() } as any,
    { upsert: jest.fn() } as any,
    capitalEventRepository as any,
    {} as any,
    {} as any,
    {
      ownerUserId: OWNER,
      improvementLanes: ['BOT_PAPER'],
      botRecordingEnabled: false,
      ...overrides,
    } as any,
  );

  return { service, tapeRepository, tradeRepository, capitalEventRepository };
}

const tapeSample = {
  symbol: 'SPY   260917C00650000',
  openedAt: 1_700_000_000_000,
  at: 1_700_000_060_000,
  optionBid: 1.2,
  optionAsk: 1.25,
  spot: 650,
};

/**
 * The improvement loop trains on one paper account and rewrites strategy
 * code from what it finds. Both lanes are open to every user, so this gate
 * is the only thing keeping customer trades out of the training set — hence
 * testing it directly rather than trusting the call sites.
 */
describe('BotRecordingService corpus gate', () => {
  it("records the owner's paper trades", async () => {
    const { service, tapeRepository } = build();

    await runAsUser(OWNER, () =>
      service.recordTapeSample({ ...tapeSample, lane: BotLane.BOT_PAPER }),
    );

    expect(tapeRepository.insert).toHaveBeenCalledTimes(1);
  });

  it("ignores another user's paper trades", async () => {
    const { service, tapeRepository } = build();

    await runAsUser('customer-user-id', () =>
      service.recordTapeSample({ ...tapeSample, lane: BotLane.BOT_PAPER }),
    );

    expect(tapeRepository.insert).not.toHaveBeenCalled();
  });

  it("ignores the owner's live trades by default", async () => {
    const { service, tapeRepository } = build();

    await runAsUser(OWNER, () =>
      service.recordTapeSample({ ...tapeSample, lane: BotLane.BOT_LIVE }),
    );

    expect(tapeRepository.insert).not.toHaveBeenCalled();
  });

  it('honours a widened improvementLanes config', async () => {
    const { service, tapeRepository } = build({
      improvementLanes: ['BOT_PAPER', 'BOT_LIVE'],
    });

    await runAsUser(OWNER, () =>
      service.recordTapeSample({ ...tapeSample, lane: BotLane.BOT_LIVE }),
    );

    expect(tapeRepository.insert).toHaveBeenCalledTimes(1);
  });

  it('records nothing when no owner is configured', async () => {
    const { service, tapeRepository } = build({ ownerUserId: null });

    await runAsUser(OWNER, () =>
      service.recordTapeSample({ ...tapeSample, lane: BotLane.BOT_PAPER }),
    );

    expect(tapeRepository.insert).not.toHaveBeenCalled();
  });

  it('gates capital events too', async () => {
    const { service, capitalEventRepository } = build();

    await runAsUser('customer-user-id', () =>
      service.recordCapitalEvent({
        reason: BotCapitalEventReason.MANUAL_RESET,
        lane: BotLane.BOT_PAPER,
        balanceBefore: 6000,
        balanceAfter: 6000,
      }),
    );
    expect(capitalEventRepository.insert).not.toHaveBeenCalled();

    await runAsUser(OWNER, () =>
      service.recordCapitalEvent({
        reason: BotCapitalEventReason.MANUAL_RESET,
        lane: BotLane.BOT_PAPER,
        balanceBefore: 4000,
        balanceAfter: 6000,
      }),
    );
    expect(capitalEventRepository.insert).toHaveBeenCalledTimes(1);
  });

  it('gates completed trades too', async () => {
    const { service, tradeRepository } = build();

    await runAsUser('customer-user-id', () =>
      service.recordTradeClose({
        symbol: tapeSample.symbol,
        openedAt: tapeSample.openedAt,
        closedAt: tapeSample.at,
        lane: BotLane.BOT_PAPER,
        direction: null,
        quantity: 1,
        entryPrice: 1,
        exitPrice: 1.5,
        entryUnderlying: null,
        exitUnderlying: null,
        stopPremium: null,
        targetPremium: null,
        stopUnderlying: null,
        targetUnderlying: null,
        atrUsed: null,
        strategies: null,
        entryReason: null,
        exitReason: null,
        configVersion: null,
      }),
    );

    expect(tradeRepository.insert).not.toHaveBeenCalled();
    expect(tradeRepository.upsert).not.toHaveBeenCalled();
  });
});
