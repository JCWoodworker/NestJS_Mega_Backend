import {
  LOW_FIDELITY_INTERVAL_SEC,
  quotesFromSnapshot,
  runBacktest,
  type BacktestConfig,
  type BacktestSession,
  type BacktestSnapshot,
} from './bot-backtest.util';
import { type BotCandle } from './bot-strategy.util';

/** 2026-09-24 09:30 ET. */
const OPEN_ET = Date.parse('2026-09-24T13:30:00.000Z');
const MINUTE = 60_000;

function config(overrides: Partial<BacktestConfig> = {}): BacktestConfig {
  return {
    strategies: ['ORB_5M'],
    combineMode: 'ANY',
    directionsEnabled: ['CALL', 'PUT'],
    filters: {
      deltaMin: 0.4,
      deltaMax: 0.6,
      minPremium: 0.6,
      maxPremium: 2.5,
      maxSpreadPct: 5,
    },
    atrPeriod: 14,
    cooldownMins: 5,
    tradeWindowStart: '09:30',
    tradeWindowEnd: '15:00',
    hardFlattenTime: '15:30',
    usePremiumStop: true,
    premiumStopPct: 25,
    usePremiumTarget: true,
    premiumTargetPct: 40,
    useTrailStop: false,
    trailArmPct: 10,
    trailPct: 15,
    trailMinLockPct: 5,
    stopAtrMult: 1.5,
    targetAtrMult: 2.5,
    riskPct: 10,
    equity: 6000,
    ...overrides,
  };
}

/** A breakout day: flat opening range, then a steady climb. */
function bars(count = 40): BotCandle[] {
  return Array.from({ length: count }, (_, i) => {
    const close = i < 6 ? 600 : 600 + (i - 5) * 0.5;
    return {
      chartTime: OPEN_ET + i * MINUTE,
      open: close,
      high: close + 0.1,
      low: close - 0.1,
      close,
      volume: 1000,
    };
  });
}

/**
 * One snapshot per bar. `callBid` drives the held contract's mark, so a test
 * can steer the trade to a specific exit.
 */
function snapshots(
  count: number,
  callBid: (i: number) => number,
  intervalMs = MINUTE,
): BacktestSnapshot[] {
  return Array.from({ length: count }, (_, i) => ({
    at: OPEN_ET + i * intervalMs,
    spot: 600,
    expiration: '260924',
    quotes: [
      [600, 0, 0.5, callBid(i), callBid(i) + 0.02],
      [600, 1, -0.5, 1, 1.02],
    ] as BacktestSnapshot['quotes'],
  }));
}

function session(
  overrides: Partial<BacktestSession> = {},
): BacktestSession {
  return {
    etDateKey: '2026-09-24',
    bars: bars(),
    snapshots: snapshots(40, () => 1),
    ...overrides,
  };
}

describe('quotesFromSnapshot', () => {
  /** The replay picks strikes with the production selector, which reads OSI. */
  it('rebuilds padded OSI symbols from stored tuples', () => {
    const [call, put] = quotesFromSnapshot(
      {
        at: OPEN_ET,
        spot: 600,
        expiration: '260924',
        quotes: [
          [600, 0, 0.5, 1.2, 1.25],
          [612.5, 1, -0.4, 1.1, 1.15],
        ],
      },
      '260924',
    );

    expect(call.symbol).toBe('SPY   260924C00600000');
    expect(put.symbol).toBe('SPY   260924P00612500');
    expect(call.delta).toBe(0.5);
    expect(put.bid).toBe(1.1);
  });
});

describe('runBacktest entries', () => {
  it('opens a trade when the breakout rule fires', () => {
    const result = runBacktest([session()], config());

    expect(result.tradeCount).toBeGreaterThan(0);
    expect(result.trades[0].direction).toBe('CALL');
    expect(result.trades[0].strategies).toEqual(['ORB_5M']);
  });

  /** Sizing must match production or every P&L figure is off by a factor. */
  it('sizes from the risk budget, paying the ask', () => {
    const result = runBacktest(
      [session({ snapshots: snapshots(40, () => 1) })],
      config(),
    );

    // Budget 6000 x 10% = 600; ask 1.02 -> floor(600 / 102) = 5.
    expect(result.trades[0].entryPremium).toBe(1.02);
    expect(result.trades[0].quantity).toBe(5);
  });

  it('refuses a direction that is turned off', () => {
    const result = runBacktest(
      [session()],
      config({ directionsEnabled: ['PUT'] }),
    );

    expect(result.tradeCount).toBe(0);
    expect(result.skipped.DIRECTION_DISABLED).toBeGreaterThan(0);
  });

  it('records when no contract passes the filters', () => {
    const result = runBacktest(
      [session()],
      config({
        filters: { ...config().filters, minPremium: 90, maxPremium: 100 },
      }),
    );

    expect(result.tradeCount).toBe(0);
    expect(result.skipped.NO_CONTRACT_MATCH).toBeGreaterThan(0);
  });

  it('holds one position at a time', () => {
    const result = runBacktest([session()], config());

    const overlapping = result.trades.some((trade, i) => {
      const next = result.trades[i + 1];
      return next != null && next.openedAt < trade.closedAt;
    });
    expect(overlapping).toBe(false);
  });
});

describe('runBacktest exits', () => {
  it('takes the premium target when the bid reaches it', () => {
    // Entry at ask 1.02; target is entry x 1.40 = 1.428.
    const result = runBacktest(
      [session({ snapshots: snapshots(40, (i) => (i > 8 ? 1.6 : 1)) })],
      config(),
    );

    expect(result.trades[0].exitReason).toBe('PREMIUM_TARGET');
    expect(result.trades[0].netPnl).toBeGreaterThan(0);
  });

  it('takes the premium stop when the bid collapses', () => {
    // Stop is entry x 0.75 = 0.765.
    const result = runBacktest(
      [session({ snapshots: snapshots(40, (i) => (i > 8 ? 0.5 : 1)) })],
      config(),
    );

    expect(result.trades[0].exitReason).toBe('PREMIUM_STOP');
    expect(result.trades[0].netPnl).toBeLessThan(0);
  });

  /** Exits mark at the bid, matching the marketable STC the live path sends. */
  it('exits at the bid, not the mid or the ask', () => {
    const result = runBacktest(
      [session({ snapshots: snapshots(40, (i) => (i > 8 ? 1.6 : 1)) })],
      config(),
    );

    expect(result.trades[0].exitPremium).toBe(1.6);
  });

  it('charges a round-trip commission', () => {
    const result = runBacktest([session()], config());

    expect(result.trades[0].fees).toBeGreaterThan(0);
    expect(result.trades[0].netPnl).toBe(
      Math.round((result.trades[0].grossPnl - result.trades[0].fees) * 100) /
        100,
    );
  });
});

describe('runBacktest fidelity', () => {
  /**
   * The live exit loop runs on every underlying tick. Between two coarse
   * samples a stop can be touched and recovered, so a minute-resolution replay
   * under-counts stop-outs in one direction only — quoting it against live
   * P&L would overstate any candidate.
   */
  it('flags minute-resolution sampling as unsafe to compare', () => {
    const result = runBacktest([session()], config());

    expect(result.snapshotIntervalSec).toBe(60);
    expect(result.lowFidelity).toBe(true);
  });

  it('accepts five-second sampling', () => {
    const result = runBacktest(
      [session({ snapshots: snapshots(400, () => 1, 5_000) })],
      config(),
    );

    expect(result.snapshotIntervalSec).toBe(5);
    expect(result.lowFidelity).toBe(false);
  });

  /** One coarse session is enough to make a pooled result unsafe. */
  it('lets the worst session govern a mixed run', () => {
    const result = runBacktest(
      [
        session({ snapshots: snapshots(400, () => 1, 5_000) }),
        session({
          etDateKey: '2026-09-25',
          snapshots: snapshots(40, () => 1),
        }),
      ],
      config(),
    );

    expect(result.snapshotIntervalSec).toBeGreaterThan(
      LOW_FIDELITY_INTERVAL_SEC,
    );
    expect(result.lowFidelity).toBe(true);
  });

  it('reports low fidelity when there is nothing to measure', () => {
    const result = runBacktest(
      [session({ bars: [], snapshots: [] })],
      config(),
    );

    expect(result.tradeCount).toBe(0);
    expect(result.lowFidelity).toBe(true);
  });
});
