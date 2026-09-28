/* eslint-disable no-console */
import { readFileSync, writeFileSync } from 'fs';

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
 * Intended for the weekly improvement agent, which has no database access:
 * it pulls a fixture over HTTP, runs this on `main` to get a baseline, then
 * again on its branch, and puts both numbers in the pull request.
 *
 * Exits non-zero only when the run could not happen. A candidate that does
 * worse is a result, not a failure, and the agent is expected to report it.
 */

const DEFAULT_CONFIG: BacktestConfig = {
  strategies: ['VWAP_PULLBACK', 'ORB_5M'],
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
  useTrailStop: true,
  trailArmPct: 10,
  trailPct: 15,
  trailMinLockPct: 5,
  stopAtrMult: 1.5,
  targetAtrMult: 2.5,
  riskPct: 10,
  equity: 6000,
};

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function loadSessions(): Promise<BacktestSession[]> {
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
  if (!file) return DEFAULT_CONFIG;
  return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(file, 'utf8')) };
}

function report(result: BacktestResult): void {
  console.log('');
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
  const sessions = await loadSessions();
  if (!sessions.length) {
    throw new Error('Fixture contained no replayable sessions');
  }
  const result = runBacktest(sessions, loadConfig());
  report(result);

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
