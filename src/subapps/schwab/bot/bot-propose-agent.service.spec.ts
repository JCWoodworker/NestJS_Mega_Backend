import { BotProposeAgentService } from './bot-propose-agent.service';
import { type ProposePacket } from './bot-propose.util';

function packet(overrides: Partial<ProposePacket> = {}): ProposePacket {
  return {
    weekEndingEt: '2026-09-25',
    readinessPropose: 'indicative',
    strategyTradeCount: 64,
    opsTradeCount: 1,
    actionable: false,
    blockedReasons: ['NO_HOLDOUT_IMPROVEMENT'],
    patch: {},
    holdoutDeltaPerTrade: null,
    bootstrapLowerBound: null,
    stableSessions: 1,
    changeType: 'config',
    allowedPaths: [],
    sessionSummaries: [],
    opsExits: [],
    dossier: {
      weekEndingEt: '2026-09-25',
      generatedAt: 0,
      sessions: [
        {
          etDateKey: '2026-09-21',
          trades: 10,
          wins: 6,
          netPnl: 627.5,
          winRate: 60,
        },
      ],
      strategyPerformance: [],
      signalFunnel: {
        signals: 0,
        entrySubmits: 0,
        entryFills: 0,
        fillRate: null,
      },
      skipCensus: [],
      contractMisses: [],
      excursion: {
        trades: 0,
        medianCaptureEfficiency: null,
        medianHoldMs: null,
        medianTimeToMfeMs: null,
        neverProfitable: 0,
        gaveBackAWinner: 0,
        blindTrades: 0,
      },
      timeOfDay: [],
      sessionContext: [],
      configWindows: [],
      rapidScalpReplay: {
        name: 'RAPID_SCALP',
        tradesScored: 0,
        tradesUnscored: 0,
        netPnl: 0,
        actualNetPnl: 0,
        deltaVsActual: 0,
        wins: 0,
        note: 'Same recorded entries only.',
      },
      notes: [],
    },
    book: 'v2|SPY|60',
    ...overrides,
  };
}

function build(agentEnabled = true) {
  return new BotProposeAgentService({
    botProposeAgentEnabled: agentEnabled,
  } as any);
}

describe('BotProposeAgentService gating', () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it('does nothing while the flag is off', async () => {
    await expect(build(false).launch(packet())).resolves.toEqual({
      status: 'flag_off',
    });
  });

  it('does nothing when the search has not named a winner', async () => {
    const result = await build().launch(
      packet({ dossier: { ...packet().dossier, sessions: [] } }),
    );

    expect(result.status).toBe('no_winner');
  });

  /**
   * A losing week used to start an agent anyway. The search is the gate now.
   */
  it('does not start an agent when the search has no winner', async () => {
    process.env.CURSOR_API_KEY = 'key';
    process.env.BOT_PROPOSE_GITHUB_REPO = 'https://github.com/example/nest';

    const result = await build().launch(
      packet({ actionable: false, blockedReasons: ['BOOTSTRAP_FAIL'] }),
    );

    expect(result.status).toBe('no_winner');
  });

  it('stops a winning week when no API key is configured', async () => {
    delete process.env.CURSOR_API_KEY;

    const result = await build().launch(winning());

    expect(result.status).toBe('no_api_key');
  });

  it('stops when no repository is configured', async () => {
    process.env.CURSOR_API_KEY = 'key';
    delete process.env.BOT_PROPOSE_GITHUB_REPO;

    await expect(build().launch(winning())).resolves.toEqual({
      status: 'no_repo',
    });
  });
});

describe('BotProposeAgentService prompt', () => {
  const service = build();
  const prompt = (p = winning()) =>
    service['buildPrompt'](p, p.search!.winner!, 'https://x/fixture');

  it('hands the agent the dossier', () => {
    expect(prompt()).toContain('"etDateKey":"2026-09-21"');
  });

  it('names the paths a strategy change may touch', () => {
    const text = prompt();
    expect(text).toContain('bot-strategy.util.ts');
    expect(text).toContain('bot-v2-settings.entity.ts');
    expect(text).toContain('migrations/');
  });

  it('forbids the execution and safety paths', () => {
    const text = prompt();
    expect(text).toContain('bot-execution.service.ts');
    expect(text).toContain('schwab/auth/');
    expect(text).toContain('never weaken the kill switch');
  });

  it('tells the agent the search assignment is the only change', () => {
    const text = prompt();
    expect(text).toContain('Do not pick a different change');
    expect(text).toContain('Do not add a second idea');
    expect(text).not.toContain('Leave at least one change');
  });

  it('requires the replay to be run both ways', () => {
    expect(prompt()).toContain('yarn bot:backtest');
    expect(prompt()).toContain('baseline');
    expect(prompt()).toContain('SPXW');
    expect(prompt()).toContain('profit-lock');
  });

  it('requires the sampling caveat to be repeated in the PR', () => {
    const text = prompt();
    expect(text).toContain('lowFidelity');
    expect(text).toContain('understate stop-outs');
  });

  it('refuses a pull request that is not the measured assignment', () => {
    const text = prompt();
    expect(text).toContain('open no');
    expect(text).toContain('worse than');
  });
});

function winning(): ProposePacket {
  return packet({
    search: {
      tooFewSessions: false,
      searchSessions: ['2026-09-21', '2026-09-22'],
      holdoutSessions: ['2026-09-23', '2026-09-24'],
      book: {
        search: { trades: 4, net: -10, greenDays: 1, fees: 1 },
        holdout: { trades: 2, net: -2, greenDays: 0, fees: 1 },
      },
      rules: [],
      shouldHave: [],
      dropCandidates: [],
      quietCutoffPts: null,
      ran: [],
      winner: {
        id: 'window:12:00',
        kind: 'window',
        label: 'New entries stop at 12:00',
        source: 'bot-reports/research-brief.md',
        search: { trades: 3, net: 4, greenDays: 1, fees: 1 },
        holdout: { trades: 1, net: -1, greenDays: 0, fees: 1 },
        patch: { tradeWindowEnd: '12:00' },
      },
    },
  });
}
