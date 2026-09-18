import { MIN_TRADES_INDICATIVE } from './bot-analysis.util';
import { BotAnalyzerService } from './bot-analyzer.service';

const OWNER = 'owner-user-id';
const OPENED = 1_700_000_000_000;

function tradeRow(overrides: Record<string, unknown> = {}) {
  return {
    tradeKey: 'SPY-1',
    etDateKey: '2026-09-18',
    lane: 'BOT_PAPER',
    direction: 'CALL',
    quantity: 1,
    openedAt: new Date(OPENED),
    closedAt: new Date(OPENED + 600_000),
    holdMs: 600_000,
    // The pg driver returns numerics as strings, so the fixtures are strings
    // to keep the Number() coercion in the service under test.
    entryPrice: '1.0000',
    exitPrice: '1.2000',
    grossPnl: '20.0000',
    fees: '1.3000',
    netPnl: '18.7000',
    mfePremium: '1.5000',
    maePremium: '0.9000',
    timeToMfeMs: 180_000,
    captureEfficiency: '0.4000',
    sampleCount: 20,
    exitReason: 'PREMIUM_TARGET',
    strategies: ['VWAP_PULLBACK'],
    ...overrides,
  };
}

function build(options: {
  trades?: Record<string, unknown>[];
  cumulative?: number;
  tape?: Record<string, unknown>[];
  ownerUserId?: string | null;
  supervisorEnabled?: boolean;
}) {
  const trades = options.trades ?? [];
  const saved: Record<string, unknown>[] = [];

  const tradeRepository = {
    find: jest.fn().mockResolvedValue(trades),
    count: jest.fn().mockResolvedValue(options.cumulative ?? trades.length),
  };
  const tapeRepository = {
    find: jest.fn().mockResolvedValue(options.tape ?? []),
  };
  const reportRepository = {
    save: jest.fn(async (row: Record<string, unknown>) => {
      saved.push(row);
      return row;
    }),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
  };

  const service = new BotAnalyzerService(
    tradeRepository as never,
    tapeRepository as never,
    reportRepository as never,
    {
      ownerUserId:
        options.ownerUserId === undefined ? OWNER : options.ownerUserId,
      botSupervisorEnabled: options.supervisorEnabled ?? true,
    } as never,
  );

  return { service, tradeRepository, tapeRepository, reportRepository, saved };
}

describe('BotAnalyzerService', () => {
  /**
   * The whole reason this could be built before the data existed: it runs
   * from day one and reports that nothing can be concluded, instead of
   * emitting a confident answer drawn from an empty corpus.
   */
  it('still writes a report when there are no trades', async () => {
    const { service, saved } = build({ trades: [], cumulative: 0 });

    const result = await service.analyzeDay('2026-09-18');

    expect(result?.readiness.level).toBe('insufficient');
    expect(result?.aggregate.trades).toBe(0);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      userId: OWNER,
      etDateKey: '2026-09-18',
      trades: 0,
      cumulativeTrades: 0,
      readinessLevel: 'insufficient',
    });
    expect(result?.markdown).toContain('Readiness: insufficient');
  });

  /** Below the gate the grid is noise that invites over-reading. */
  it('skips the counterfactual grid below the sample threshold', async () => {
    const { service, tapeRepository, saved } = build({
      trades: [tradeRow()],
      cumulative: 5,
    });

    const result = await service.analyzeDay('2026-09-18');

    expect(result?.policyResults).toEqual([]);
    expect(tapeRepository.find).not.toHaveBeenCalled();
    expect(saved[0].markdown).toContain('Skipped');
  });

  it('runs the grid once the corpus clears the threshold', async () => {
    const { service, tapeRepository } = build({
      trades: [tradeRow()],
      cumulative: MIN_TRADES_INDICATIVE,
      tape: [
        { tradeKey: 'SPY-1', at: String(OPENED), optionBid: '1.0000' },
        { tradeKey: 'SPY-1', at: String(OPENED + 60_000), optionBid: '1.6000' },
        {
          tradeKey: 'SPY-1',
          at: String(OPENED + 120_000),
          optionBid: '1.1000',
        },
      ],
    });

    const result = await service.analyzeDay('2026-09-18');

    expect(result?.readiness.level).toBe('indicative');
    expect(tapeRepository.find).toHaveBeenCalled();
    expect(result?.policyResults.length).toBeGreaterThan(0);
    expect(result?.policyResults.some((r) => r.trades > 0)).toBe(true);
  });

  /**
   * Readiness is judged on the whole corpus, not the session — no single day
   * reaches 30 trades, so gating per-day would keep it switched off forever.
   */
  it('gates on cumulative trades rather than the session count', async () => {
    const { service, tradeRepository } = build({
      trades: [tradeRow()],
      cumulative: 150,
    });

    const result = await service.analyzeDay('2026-09-18');

    expect(tradeRepository.count).toHaveBeenCalledWith({
      where: { userId: OWNER },
    });
    expect(result?.readiness.level).toBe('trustworthy');
    expect(result?.aggregate.trades).toBe(1);
  });

  it('coerces numeric strings from the driver into real numbers', async () => {
    const { service } = build({
      trades: [tradeRow(), tradeRow({ tradeKey: 'SPY-2', netPnl: '-5.0000' })],
      cumulative: 2,
    });

    const result = await service.analyzeDay('2026-09-18');

    expect(result?.aggregate.netPnl).toBe(13.7);
    expect(result?.aggregate.wins).toBe(1);
    expect(result?.aggregate.losses).toBe(1);
  });

  /** Scoping the loop to the owner is the multi-tenant guarantee. */
  it('only ever reads and writes the owner corpus', async () => {
    const { service, tradeRepository, saved } = build({
      trades: [tradeRow()],
      cumulative: 1,
    });

    await service.analyzeDay('2026-09-18');

    expect(tradeRepository.find).toHaveBeenCalledWith({
      where: { userId: OWNER, etDateKey: '2026-09-18' },
      order: { closedAt: 'ASC' },
    });
    expect(saved[0].userId).toBe(OWNER);
  });

  it('does nothing when no owner is configured', async () => {
    const { service, tradeRepository, saved } = build({
      ownerUserId: null,
    });

    expect(await service.analyzeDay('2026-09-18')).toBeNull();
    expect(tradeRepository.find).not.toHaveBeenCalled();
    expect(saved).toHaveLength(0);
    expect(await service.listReports()).toEqual([]);
    expect(await service.getReport('2026-09-18')).toBeNull();
  });

  describe('cronAnalyze', () => {
    /** One app must analyze, or two divergent reports land for one session. */
    it('does not run when the supervisor switch is off', async () => {
      const { service, tradeRepository } = build({
        trades: [tradeRow()],
        supervisorEnabled: false,
      });

      await service.cronAnalyze();

      expect(tradeRepository.find).not.toHaveBeenCalled();
    });

    it('runs when the switch is on', async () => {
      const { service, saved } = build({
        trades: [tradeRow()],
        supervisorEnabled: true,
      });

      await service.cronAnalyze();

      expect(saved).toHaveLength(1);
    });

    /** A failed analysis must not take the process down overnight. */
    it('swallows analysis failures', async () => {
      const { service, tradeRepository } = build({ supervisorEnabled: true });
      tradeRepository.find.mockRejectedValue(new Error('db down'));

      await expect(service.cronAnalyze()).resolves.toBeUndefined();
    });
  });
});
