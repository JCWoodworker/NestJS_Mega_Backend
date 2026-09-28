import { AnalyzedTrade } from './bot-analysis.util';
import {
  buildWeeklyDossier,
  DossierEvent,
  DossierSession,
  etHalfHourBucket,
} from './bot-dossier.util';

type DossierTrade = AnalyzedTrade & { configVersion: string | null };

/** 2026-09-21 10:05 ET, a Monday inside regular hours. */
const MONDAY_1005_ET = Date.parse('2026-09-21T14:05:00.000Z');

function trade(overrides: Partial<DossierTrade> = {}): DossierTrade {
  return {
    tradeKey: `key-${Math.random()}`,
    etDateKey: '2026-09-21',
    lane: 'BOT_PAPER',
    direction: 'CALL',
    quantity: 1,
    entryPrice: 1,
    exitPrice: 1.2,
    openedAt: MONDAY_1005_ET,
    closedAt: MONDAY_1005_ET + 60_000,
    holdMs: 60_000,
    grossPnl: 20,
    fees: 1.3,
    netPnl: 18.7,
    mfePremium: 1.3,
    maePremium: 0.9,
    timeToMfeMs: 30_000,
    captureEfficiency: 0.66,
    sampleCount: 12,
    exitReason: 'PREMIUM_TARGET',
    strategies: ['VWAP_PULLBACK'],
    configVersion: 'abc123',
    ...overrides,
  };
}

function event(overrides: Partial<DossierEvent> = {}): DossierEvent {
  return {
    at: MONDAY_1005_ET,
    type: 'GATE_SKIP',
    reason: 'COOLDOWN',
    strategies: null,
    direction: null,
    payload: null,
    ...overrides,
  };
}

/** 2026-09-21 ET, one bar per entry: 09:00 (pre-market), 09:30, 10:00, 10:01. */
const PRE_MARKET_0900_ET = Date.parse('2026-09-21T13:00:00.000Z');
const OPEN_0930_ET = Date.parse('2026-09-21T13:30:00.000Z');

const session: DossierSession = {
  etDateKey: '2026-09-21',
  fullSession: true,
  // [chartTime, open, high, low, close, volume]
  bars: [
    // Pre-market spike that the bot could never have traded.
    [PRE_MARKET_0900_ET, 590, 640, 580, 600, 500],
    [OPEN_0930_ET, 600, 602, 599, 601, 1000],
    [OPEN_0930_ET + 1_800_000, 601, 604, 600, 603, 1100],
    [OPEN_0930_ET + 1_860_000, 603, 605, 601, 602, 900],
  ],
};

function build(params: Partial<Parameters<typeof buildWeeklyDossier>[0]> = {}) {
  return buildWeeklyDossier({
    weekEndingEt: '2026-09-25',
    trades: [],
    events: [],
    sessions: [],
    now: MONDAY_1005_ET,
    ...params,
  });
}

describe('etHalfHourBucket', () => {
  it('floors to the half hour in ET', () => {
    expect(etHalfHourBucket(MONDAY_1005_ET)).toBe('10:00');
    expect(etHalfHourBucket(MONDAY_1005_ET + 30 * 60_000)).toBe('10:30');
  });
});

describe('buildWeeklyDossier strategy split', () => {
  /**
   * Pooling a mean-reversion rule with a breakout rule can net to "flat" while
   * one side is quietly paying for the other, which is exactly the finding the
   * old exit-only packet could never surface.
   */
  it('separates strategies that cancel each other out', () => {
    const dossier = build({
      trades: [
        trade({ strategies: ['VWAP_PULLBACK'], netPnl: 100 }),
        trade({ strategies: ['ORB_5M'], netPnl: -100 }),
      ],
    });

    const vwap = dossier.strategyPerformance.find(
      (row) => row.strategy === 'VWAP_PULLBACK',
    );
    const orb = dossier.strategyPerformance.find(
      (row) => row.strategy === 'ORB_5M',
    );
    expect(vwap?.netPnl).toBe(100);
    expect(orb?.netPnl).toBe(-100);
  });

  it('splits a strategy by direction', () => {
    const dossier = build({
      trades: [
        trade({ direction: 'CALL', netPnl: 50 }),
        trade({ direction: 'PUT', netPnl: -80 }),
      ],
    });

    expect(
      dossier.strategyPerformance.map((row) => [row.direction, row.netPnl]),
    ).toEqual([
      ['PUT', -80],
      ['CALL', 50],
    ]);
  });

  /** Both tags recorded agreement; crediting only the first misstates them. */
  it('counts a trade under every strategy that fired', () => {
    const dossier = build({
      trades: [trade({ strategies: ['VWAP_PULLBACK', 'ORB_5M'], netPnl: 10 })],
    });

    expect(dossier.strategyPerformance).toHaveLength(2);
    expect(
      dossier.strategyPerformance.every((row) => row.netPnl === 10),
    ).toBe(true);
  });

  it('keeps untagged trades rather than dropping them', () => {
    const dossier = build({ trades: [trade({ strategies: null })] });

    expect(dossier.strategyPerformance[0].strategy).toBe('UNATTRIBUTED');
  });
});

describe('buildWeeklyDossier signal funnel and skips', () => {
  it('counts what the gates refused', () => {
    const dossier = build({
      events: [
        event({ reason: 'COOLDOWN' }),
        event({ reason: 'COOLDOWN' }),
        event({ type: 'NO_SIGNAL', reason: 'ANY_NO_SIGNAL' }),
      ],
    });

    expect(dossier.skipCensus).toEqual([
      { type: 'GATE_SKIP', reason: 'COOLDOWN', count: 2 },
      { type: 'NO_SIGNAL', reason: 'ANY_NO_SIGNAL', count: 1 },
    ]);
  });

  it('ignores event types that are not refusals', () => {
    const dossier = build({
      events: [event({ type: 'PHASE', reason: 'SCANNING → IN_POSITION' })],
    });

    expect(dossier.skipCensus).toEqual([]);
  });

  /** Signals that never become fills are lost after the setup was right. */
  it('measures how many signals reached a fill', () => {
    const dossier = build({
      events: [
        event({ type: 'SIGNAL', reason: null }),
        event({ type: 'SIGNAL', reason: null }),
        event({ type: 'ENTRY_SUBMIT', reason: null }),
        event({ type: 'ENTRY_FILL', reason: null }),
      ],
    });

    expect(dossier.signalFunnel).toEqual({
      signals: 2,
      entrySubmits: 1,
      entryFills: 1,
      fillRate: 50,
    });
  });

  /**
   * A signal that fires and finds no contract is a filter problem, not a
   * strategy problem, and the engine already counts which filter did it.
   */
  it('reports how many candidates each filter rejected', () => {
    const dossier = build({
      events: [
        event({
          type: 'SKIP',
          reason: 'NO_CONTRACT_MATCH',
          payload: {
            rejects: { delta: 15, premium: 14, spread: 6, noQuote: 0 },
            filters: { deltaMin: 0.4, deltaMax: 0.6 },
          },
        }),
        event({
          type: 'SKIP',
          reason: 'NO_CONTRACT_MATCH',
          payload: { rejects: { delta: 5, premium: 0, spread: 0, noQuote: 0 } },
        }),
      ],
    });

    expect(dossier.contractMisses).toEqual([
      { constraint: 'delta', signals: 2, contractsRejected: 20 },
      { constraint: 'premium', signals: 1, contractsRejected: 14 },
      { constraint: 'spread', signals: 1, contractsRejected: 6 },
    ]);
  });
});

describe('buildWeeklyDossier excursion profile', () => {
  it('separates entries with no edge from exits that gave one back', () => {
    const dossier = build({
      trades: [
        // Never traded above entry.
        trade({ entryPrice: 1, mfePremium: 0.9, netPnl: -40 }),
        // Went favourable, still closed red.
        trade({ entryPrice: 1, mfePremium: 1.5, netPnl: -20 }),
      ],
    });

    expect(dossier.excursion.neverProfitable).toBe(1);
    expect(dossier.excursion.gaveBackAWinner).toBe(1);
  });

  it('counts trades whose stop was never evaluable', () => {
    const dossier = build({ trades: [trade({ sampleCount: 0 })] });

    expect(dossier.excursion.blindTrades).toBe(1);
    expect(dossier.notes.join(' ')).toContain('never evaluable');
  });
});

describe('buildWeeklyDossier session context', () => {
  /**
   * Stored bars include pre- and post-market. A range taken over the raw
   * array describes a session the strategy never had access to — here the
   * 09:00 bar alone would triple the day's apparent range.
   */
  it('describes regular hours only, ignoring the extended session', () => {
    const dossier = build({ sessions: [session] });

    expect(dossier.sessionContext[0]).toMatchObject({
      etDateKey: '2026-09-21',
      open: 600,
      close: 602,
      high: 605,
      low: 599,
      rangePoints: 6,
      driftPoints: 2,
      barCount: 3,
    });
  });

  it('survives a session with no bars', () => {
    const dossier = build({
      sessions: [{ etDateKey: '2026-09-22', bars: [], fullSession: false }],
    });

    expect(dossier.sessionContext[0].rangePoints).toBeNull();
    expect(dossier.notes.join(' ')).toContain('Partial bar coverage');
  });
});

describe('buildWeeklyDossier config windows', () => {
  /** A results change that lines up with a settings change is not drift. */
  it('groups trades by the settings in force', () => {
    const dossier = build({
      trades: [
        trade({ configVersion: 'v1', etDateKey: '2026-09-21', netPnl: 10 }),
        trade({ configVersion: 'v2', etDateKey: '2026-09-23', netPnl: -30 }),
        trade({ configVersion: 'v2', etDateKey: '2026-09-24', netPnl: -10 }),
      ],
    });

    expect(dossier.configWindows).toEqual([
      {
        configVersion: 'v1',
        firstTradeEt: '2026-09-21',
        lastTradeEt: '2026-09-21',
        trades: 1,
        netPnl: 10,
      },
      {
        configVersion: 'v2',
        firstTradeEt: '2026-09-23',
        lastTradeEt: '2026-09-24',
        trades: 2,
        netPnl: -40,
      },
    ]);
  });
});

describe('buildWeeklyDossier notes', () => {
  /**
   * A red week is the input to the review, not a verdict, so the notes state
   * limits on the evidence and never conclude for the reader.
   */
  it('flags a thin sample without calling the week a failure', () => {
    const dossier = build({ trades: [trade()] });

    const notes = dossier.notes.join(' ');
    expect(notes).toContain('below the 30 needed');
    expect(notes).not.toMatch(/should|recommend|must change/i);
  });

  it('attributes refusals caused by holding one position at a time', () => {
    const dossier = build({
      events: [event({ reason: 'ALREADY_IN_POSITION' })],
    });

    expect(dossier.notes.join(' ')).toContain('position sizing');
  });
});
