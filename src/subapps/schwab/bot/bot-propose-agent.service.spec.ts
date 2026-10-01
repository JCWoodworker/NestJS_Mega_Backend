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
        { etDateKey: '2026-09-21', trades: 10, wins: 6, netPnl: 627.5, winRate: 60 },
      ],
      strategyPerformance: [],
      signalFunnel: { signals: 0, entrySubmits: 0, entryFills: 0, fillRate: null },
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

  it('does nothing when the week recorded no sessions', async () => {
    const result = await build().launch(
      packet({ dossier: { ...packet().dossier, sessions: [] } }),
    );

    expect(result.status).toBe('no_sessions');
  });

  /**
   * The loop this replaced refused to review any week whose capped settings
   * patch failed its gates — which is precisely the week worth reviewing,
   * since a losing week is the input to the analysis and not a verdict on it.
   */
  it('reviews a week whose capped settings patch failed its gates', async () => {
    delete process.env.CURSOR_API_KEY;

    const result = await build().launch(
      packet({ actionable: false, blockedReasons: ['BOOTSTRAP_FAIL'] }),
    );

    // Got past the actionable check and stopped on missing credentials.
    expect(result.status).toBe('no_api_key');
  });

  it('stops when no repository is configured', async () => {
    process.env.CURSOR_API_KEY = 'key';
    delete process.env.BOT_PROPOSE_GITHUB_REPO;

    await expect(build().launch(packet())).resolves.toEqual({
      status: 'no_repo',
    });
  });
});

describe('BotProposeAgentService prompt', () => {
  const service = build();
  const prompt = (p = packet()) => service['buildPrompt'](p, 'https://x/fixture');

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

  /** A settings gate failing says nothing about whether the strategy is fine. */
  it('tells the agent not to read a failed settings gate as permission', () => {
    expect(prompt()).toContain('not as');
    expect(prompt()).toContain('says nothing about whether the strategy');
  });

  it('requires the replay to be run both ways', () => {
    expect(prompt()).toContain('yarn bot:backtest');
    expect(prompt()).toContain('baseline');
  });

  it('requires the sampling caveat to be repeated in the PR', () => {
    const text = prompt();
    expect(text).toContain('lowFidelity');
    expect(text).toContain('understate stop-outs');
  });

  /**
   * The failure mode that would make this loop worse than not having it: a
   * confident-looking patch built to have something to show.
   */
  it('makes "no change" an acceptable outcome', () => {
    const text = prompt();
    expect(text).toContain('does not support a change');
    expect(text).toContain('worse than');
  });
});
