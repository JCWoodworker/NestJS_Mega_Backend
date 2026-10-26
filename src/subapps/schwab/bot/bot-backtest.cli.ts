/* eslint-disable no-console */
import { readFileSync, writeFileSync } from 'fs';

import { DEFAULT_PROFIT_LOCK } from '../bot-v2/bot-v2-profit-lock.util';
import {
  LOW_FIDELITY_INTERVAL_SEC,
  runBacktest,
  type BacktestConfig,
  type BacktestResult,
  type BacktestSession,
} from './bot-backtest.util';

/**
 * Replay recorded sessions from the command line.
 *
 *   yarn bot:backtest --fixture ./fixture.json
 *   yarn bot:backtest --url https://<app>/api/v1/subapps/schwab/bot/fixture \
 *                     --token $BOT_FIXTURE_TOKEN --from 2026-09-21
 *
 * The default run is the house trainer: SPXW chain only, 15-second bars built
 * from that chain's spot, and the profit-lock ladder. A `--url` fetch asks
 * the fixture endpoint for that underlying so the SPY chain is not downloaded.
 *
 * Intended for the weekly improvement agent, which has no database access:
 * it pulls a fixture over HTTP, runs this on `main` to get a baseline, then
 * again on its branch, and puts both numbers in the pull request.
 *
 * Exits non-zero only when the run could not happen. A candidate that does
 * worse is a result, not a failure, and the agent is expected to report it.
 */

/**
 * The house trainer as it is armed: SPXW, 15-second bars, one contract, the
 * shared profit-lock ladder, and the session VWAP gate. A partial `--config`
 * file overrides fields on top of this. The old 25% stop and 40% target are
 * still on the type so a config can name them; `profitLock` is what sells.
 */
const DEFAULT_CONFIG: BacktestConfig = {
  strategies: [
    'VWAP_PULLBACK',
    'ORB_5M_CROSS',
    'VWAP_ROLLING_100',
    'VWAP_REVERSION',
    'ORB_RETEST',
    'EMA_MOMENTUM',
    'RANGE_FADE',
  ],
  combineMode: 'ANY',
  directionsEnabled: ['CALL', 'PUT'],
  filters: {
    deltaMin: 0.4,
    deltaMax: 0.6,
    minPremium: 6,
    maxPremium: 25,
    maxSpreadPct: 5,
  },
  atrPeriod: 14,
  cooldownMins: 2,
  tradeWindowStart: '09:30',
  tradeWindowEnd: '14:45',
  hardFlattenTime: '15:55',
  usePremiumStop: true,
  premiumStopPct: 25,
  usePremiumTarget: true,
  premiumTargetPct: 40,
  useTrailStop: true,
  trailArmPct: 10,
  trailPct: 15,
  trailMinLockPct: 5,
  stopAtrMult: 1.5,
  targetAtrMult: 2.5,
  riskPct: 10,
  equity: 10_000,
  underlying: 'SPXW',
  signalBarSeconds: 15,
  profitLock: DEFAULT_PROFIT_LOCK,
  useTimeStop: true,
  timeStopSeconds: 180,
  useScaleOut: true,
  paperSlippageCents: 1,
  useRiskAtStop: true,
  maxRiskUsd: 800,
  settledCash: 10_000,
  trendGate: true,
  /** Last 500 closed 15-second bars, matching the live trainer buffer. */
  maxBars: 500,
};

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function loadSessions(config: BacktestConfig): Promise<BacktestSession[]> {
  const file = arg('fixture');
  if (file) {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return parsed.sessions ?? parsed;
  }

  const url = arg('url');
  if (!url) {
    throw new Error('Pass --fixture <file> or --url <endpoint> --token <token>');
  }
  const token = arg('token') ?? process.env.BOT_FIXTURE_TOKEN;
  if (!token) throw new Error('Missing --token or BOT_FIXTURE_TOKEN');

  const query = new URLSearchParams();
  if (arg('from')) query.set('from', arg('from') as string);
  if (arg('to')) query.set('to', arg('to') as string);
  const underlying = arg('underlying') ?? config.underlying;
  if (underlying) query.set('underlying', underlying);

  const response = await fetch(`${url}?${query}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Fixture fetch failed: ${response.status}`);
  }
  const body = (await response.json()) as { sessions: BacktestSession[] };

  const cache = arg('save');
  if (cache) {
    writeFileSync(cache, JSON.stringify(body));
    console.log(`Saved fixture to ${cache}`);
  }
  return body.sessions;
}

function loadConfig(): BacktestConfig {
  const file = arg('config');
  const config: BacktestConfig = file
    ? { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(file, 'utf8')) }
    : { ...DEFAULT_CONFIG };
  const underlying = arg('underlying');
  if (underlying === 'SPY' || underlying === 'SPXW') config.underlying = underlying;
  if (underlying === 'SPX') config.underlying = 'SPXW';
  return config;
}

function report(result: BacktestResult, config: BacktestConfig): void {
  console.log('');
  console.log(
    `Book:        ${config.underlying ?? 'recorded'} ` +
      `${config.signalBarSeconds ?? 60}s ` +
      `${config.profitLock ? 'profit-lock' : 'legacy exit'}`,
  );
  console.log(`Sessions:    ${result.sessions.join(', ') || 'none'}`);
  console.log(`Sampling:    ${result.snapshotIntervalSec ?? '?'}s`);
  console.log(`Trades:      ${result.tradeCount}`);
  console.log(
    `Win rate:    ${result.winRate == null ? '-' : `${result.winRate}%`} ` +
      `(${result.wins}/${result.tradeCount})`,
  );
  console.log(`Net P&L:     ${result.netPnl}`);
  console.log(`Expectancy:  ${result.expectancy ?? '-'} per trade`);
  console.log(`Fees:        ${result.fees}`);
  if (Object.keys(result.skipped).length) {
    console.log(`Skipped:     ${JSON.stringify(result.skipped)}`);
  }

  if (result.lowFidelity) {
    console.log('');
    console.log(
      `WARNING: sampling is coarser than ${LOW_FIDELITY_INTERVAL_SEC}s. The live ` +
        'exit loop runs on every tick, so a stop touched and recovered between ' +
        'two samples is invisible here. This run understates stop-outs and ' +
        'flatters any candidate. Do not compare it against live P&L, and say ' +
        'so wherever the number is quoted.',
    );
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const sessions = await loadSessions(config);
  if (!sessions.length) {
    throw new Error('Fixture contained no replayable sessions');
  }
  const result = runBacktest(sessions, config);
  report(result, config);

  const out = arg('out');
  if (out) {
    writeFileSync(out, JSON.stringify(result, null, 2));
    console.log(`\nWrote ${out}`);
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
