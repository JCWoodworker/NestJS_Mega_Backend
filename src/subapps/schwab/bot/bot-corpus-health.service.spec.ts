import { BotCorpusHealthService } from './bot-corpus-health.service';

const OWNER = 'owner-user-id';

function build(options: {
  ownerUserId?: string | null;
  recordingEnabled?: boolean;
  improvementLanes?: string[];
  tradesRecordedToday?: number;
  totalTradesRows?: number;
  realizedTodayCount?: number | Error;
  accountHash?: string | Error;
  foreignRows?: { user_id: string }[];
}) {
  const tapeRepository = { count: jest.fn().mockResolvedValue(0) };
  const tradeRepository = {
    count: jest
      .fn()
      .mockImplementation(
        async ({ where }: { where: Record<string, unknown> }) => {
          // Distinguish the total-rows call (userId only) from the
          // today-scoped call (userId + etDateKey) by shape, same as the
          // real repository would via different where clauses.
          if ('etDateKey' in where) return options.tradesRecordedToday ?? 0;
          return options.totalTradesRows ?? 0;
        },
      ),
    query: jest.fn().mockResolvedValue(options.foreignRows ?? []),
  };
  const snapshotRepository = { count: jest.fn().mockResolvedValue(0) };
  const marketDayRepository = { count: jest.fn().mockResolvedValue(0) };
  const capitalEventRepository = { count: jest.fn().mockResolvedValue(0) };
  const realizedTradeRepository = {
    count: jest.fn().mockImplementation(async () => {
      if (options.realizedTodayCount instanceof Error) {
        throw options.realizedTodayCount;
      }
      return options.realizedTodayCount ?? 0;
    }),
  };
  const accountResolver = {
    resolve: jest.fn().mockImplementation(async () => {
      if (options.accountHash instanceof Error) throw options.accountHash;
      return options.accountHash ?? 'ACCOUNT_HASH';
    }),
  };

  const service = new BotCorpusHealthService(
    tapeRepository as never,
    tradeRepository as never,
    snapshotRepository as never,
    marketDayRepository as never,
    capitalEventRepository as never,
    realizedTradeRepository as never,
    accountResolver as never,
    {
      ownerUserId:
        options.ownerUserId === undefined ? OWNER : options.ownerUserId,
      botRecordingEnabled: options.recordingEnabled ?? true,
      improvementLanes: options.improvementLanes ?? ['BOT_PAPER'],
    } as never,
  );

  return { service, realizedTradeRepository, accountResolver, tradeRepository };
}

describe('BotCorpusHealthService', () => {
  /**
   * The check that would have caught 2026-09-18: trades closed all session
   * while the recorder silently wrote nothing, and the corpus's own row
   * count has no way to know that's wrong. A count from the P&L ledger — a
   * table the recorder never touches — is what makes that visible.
   */
  it('flags a gap when trades closed today but none were recorded', async () => {
    const { service } = build({
      tradesRecordedToday: 0,
      totalTradesRows: 0,
      realizedTodayCount: 6,
    });

    const health = await service.getHealth();
    const bt = health.tables.find((t) => t.table === 'bot_trades')!;

    expect(bt.verdict).toBe('empty');
    expect(bt.today).toBe(0);
    expect(bt.note).toMatch(/6 trade\(s\) closed today/);
    expect(bt.note).toMatch(/missed 6/);
  });

  it('flags a partial gap when some but not all of today recorded', async () => {
    const { service } = build({
      tradesRecordedToday: 4,
      totalTradesRows: 40,
      realizedTodayCount: 6,
    });

    const bt = (await service.getHealth()).tables.find(
      (t) => t.table === 'bot_trades',
    )!;

    expect(bt.verdict).toBe('sparse');
    expect(bt.note).toMatch(/missed 2/);
  });

  it('reports ok when today matches and the total sample clears the threshold', async () => {
    const { service } = build({
      tradesRecordedToday: 6,
      totalTradesRows: 40,
      realizedTodayCount: 6,
    });

    const bt = (await service.getHealth()).tables.find(
      (t) => t.table === 'bot_trades',
    )!;

    expect(bt.verdict).toBe('ok');
    expect(bt.note).toBeNull();
  });

  it('falls back to the sample-size warning on a quiet day with nothing closed', async () => {
    const { service } = build({
      tradesRecordedToday: 0,
      totalTradesRows: 5,
      realizedTodayCount: 0,
    });

    const bt = (await service.getHealth()).tables.find(
      (t) => t.table === 'bot_trades',
    )!;

    // No gap (0 closed, 0 recorded — consistent), but still under the
    // analyzer's 30-trade readiness threshold.
    expect(bt.verdict).toBe('sparse');
    expect(bt.note).toMatch(/Under ~30 trades/);
  });

  /**
   * Resolving the account hash makes a live call the first time it's not
   * cached. A health check must not itself become another way for this page
   * to break, so a failure here degrades rather than throwing through the
   * whole endpoint.
   */
  it('degrades to the total-based verdict when the account hash cannot be resolved', async () => {
    const { service } = build({
      tradesRecordedToday: 0,
      totalTradesRows: 45,
      accountHash: new Error('No Schwab accounts linked to this app yet'),
    });

    const health = await service.getHealth();
    const bt = health.tables.find((t) => t.table === 'bot_trades')!;

    expect(bt.verdict).toBe('ok');
    expect(bt.note).toBeNull();
  });

  it('does nothing gap-related without a configured owner', async () => {
    const { service, realizedTradeRepository } = build({
      ownerUserId: null,
      totalTradesRows: 0,
    });

    const health = await service.getHealth();

    expect(realizedTradeRepository.count).not.toHaveBeenCalled();
    expect(health.ownerConfigured).toBe(false);
    expect(health.tables.find((t) => t.table === 'bot_trades')!.verdict).toBe(
      'empty',
    );
  });

  it('scopes the realized-trade comparison to the owner account and configured lanes', async () => {
    const { service, realizedTradeRepository } = build({
      improvementLanes: ['BOT_PAPER', 'BOT_LIVE'],
      realizedTodayCount: 3,
    });

    await service.getHealth();

    const call = realizedTradeRepository.count.mock.calls[0][0];
    expect(call.where.accountHash).toBe('ACCOUNT_HASH');
    expect(call.where.source._value).toEqual(['BOT_PAPER', 'BOT_LIVE']);
  });
});
