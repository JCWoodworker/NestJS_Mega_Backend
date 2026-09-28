import { runAsUser } from '@schwab/shared/schwab-user-context';

import { BotRecordingService } from './bot-recording.service';
import { BotCapitalEventReason } from './entities/bot-capital-event.entity';
import { BotLane } from './enums/bot-lane.enum';

const OWNER = 'owner-user-id';

function build(
  overrides: Record<string, unknown> = {},
  marketDataService: Record<string, unknown> = {},
) {
  const tapeRepository = { insert: jest.fn(), find: jest.fn(() => []) };
  const tradeRepository = { insert: jest.fn(), upsert: jest.fn() };
  const capitalEventRepository = { insert: jest.fn() };
  const snapshotRepository = { insert: jest.fn() };

  const service = new BotRecordingService(
    tapeRepository as any,
    tradeRepository as any,
    snapshotRepository as any,
    { upsert: jest.fn() } as any,
    capitalEventRepository as any,
    marketDataService as any,
    {} as any,
    {
      ownerUserId: OWNER,
      improvementLanes: ['BOT_PAPER'],
      botRecordingEnabled: false,
      underlyingSymbol: 'SPY',
      ...overrides,
    } as any,
  );

  return {
    service,
    tapeRepository,
    tradeRepository,
    capitalEventRepository,
    snapshotRepository,
  };
}

const tapeSample = {
  symbol: 'SPY   260917C00650000',
  openedAt: 1_700_000_000_000,
  at: 1_700_000_060_000,
  optionBid: 1.2,
  optionAsk: 1.25,
  spot: 650,
};

function tradeClose(lane: BotLane = BotLane.BOT_PAPER) {
  return {
    symbol: tapeSample.symbol,
    openedAt: tapeSample.openedAt,
    closedAt: tapeSample.at,
    lane,
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
  };
}

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

  /**
   * Regression: these tables have `user_id NOT NULL`, and the writers did not
   * set it. Every insert failed with a not-null violation, each writer's
   * defensive try/catch swallowed it, and the corpus silently recorded nothing
   * for a whole session while the bot traded normally.
   *
   * Asserting the payload rather than just the call is the difference —
   * against a mock repository, a missing column is invisible otherwise.
   */
  it('stamps the owning user id on tape samples', async () => {
    const { service, tapeRepository } = build();

    await runAsUser(OWNER, () =>
      service.recordTapeSample({ ...tapeSample, lane: BotLane.BOT_PAPER }),
    );

    expect(tapeRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: OWNER }),
    );
  });

  it('stamps the owning user id on completed trades', async () => {
    const { service, tradeRepository } = build();

    await runAsUser(OWNER, () => service.recordTradeClose(tradeClose()));

    expect(tradeRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: OWNER }),
      expect.anything(),
    );
  });

  /**
   * The unique index became (user_id, trade_key) when the bot went
   * multi-tenant. An ON CONFLICT target that does not match a real constraint
   * is a hard Postgres error, so this has to track the index.
   */
  it('upserts trades on the composite unique key', async () => {
    const { service, tradeRepository } = build();

    await runAsUser(OWNER, () => service.recordTradeClose(tradeClose()));

    expect(tradeRepository.upsert).toHaveBeenCalledWith(expect.anything(), [
      'userId',
      'tradeKey',
    ]);
  });

  it('stamps the owning user id on capital events', async () => {
    const { service, capitalEventRepository } = build();

    await runAsUser(OWNER, () =>
      service.recordCapitalEvent({
        reason: BotCapitalEventReason.MANUAL_RESET,
        lane: BotLane.BOT_PAPER,
        balanceBefore: 4000,
        balanceAfter: 6000,
      }),
    );

    expect(capitalEventRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: OWNER }),
    );
  });

  /** Reading the tape back must be scoped too — trade keys repeat per user. */
  it('reads the tape scoped to the owning user', async () => {
    const { service, tapeRepository } = build();

    await runAsUser(OWNER, () => service.recordTradeClose(tradeClose()));

    expect(tapeRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: OWNER }),
      }),
    );
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

/**
 * The chain snapshot is the only record of the moments the bot did *not*
 * act, and `/chains` has no "as of" parameter — anything missed here is
 * missed permanently.
 */
describe('BotRecordingService chain snapshots', () => {
  const chain = [
    { symbol: 'SPY   260917C00650000', delta: 0.5, bid: 1.2, ask: 1.25 },
    { symbol: 'SPY   260917P00650000', delta: -0.5, bid: 1.1, ask: 1.15 },
  ];

  function buildRecorder(underlyingPrice: number | null = 650.12) {
    return build(
      {},
      {
        getOptionChain: jest.fn(async () => chain),
        getLastUnderlyingPrice: jest.fn(() => underlyingPrice),
      },
    );
  }

  it('stamps spot from the chain fetch instead of writing null', async () => {
    const { service, snapshotRepository } = buildRecorder();

    await service['snapshotChain']();

    expect(snapshotRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ spot: 650.12 }),
    );
  });

  /** A stale underlying is worse than none: it silently misdates the row. */
  it('leaves spot null when no fresh underlying price is available', async () => {
    const { service, snapshotRepository } = buildRecorder(null);

    await service['snapshotChain']();

    expect(snapshotRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ spot: null }),
    );
  });

  it('records the wall clock to the second', async () => {
    const { service, snapshotRepository } = buildRecorder();

    await service['snapshotChain']();

    const [row] = snapshotRepository.insert.mock.calls[0];
    expect(row.etHhMm).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  /**
   * The cadence guard used to key on the ET minute, which at sub-minute
   * recording would have thrown away all but the first snapshot of each
   * minute — the exact data this cadence exists to collect.
   */
  it('writes more than once within the same minute', async () => {
    const { service, snapshotRepository } = buildRecorder();

    await service['snapshotChain']();
    service['lastSnapshotAt'] = Date.now() - 5_000;
    await service['snapshotChain']();

    expect(snapshotRepository.insert).toHaveBeenCalledTimes(2);
  });

  /** But a tick that runs long must not double-write the same instant. */
  it('skips a second snapshot taken immediately after the first', async () => {
    const { service, snapshotRepository } = buildRecorder();

    await service['snapshotChain']();
    await service['snapshotChain']();

    expect(snapshotRepository.insert).toHaveBeenCalledTimes(1);
  });

  it('captures both rights with delta, bid and ask', async () => {
    const { service, snapshotRepository } = buildRecorder();

    await service['snapshotChain']();

    const [row] = snapshotRepository.insert.mock.calls[0];
    expect(row.quotes).toEqual([
      [650, 0, 0.5, 1.2, 1.25],
      [650, 1, -0.5, 1.1, 1.15],
    ]);
  });
});
