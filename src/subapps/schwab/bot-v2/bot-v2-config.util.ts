import { createHash } from 'crypto';

import { SignalBarSeconds } from './bot-v2-bars.util';

export type BotV2Underlying = 'SPY' | 'SPXW';

export function isBotV2Underlying(value: string): value is BotV2Underlying {
  return value === 'SPY' || value === 'SPXW';
}

/** `v2|SPY|60` or `v2|SPXW|15`, without the settings hash. */
export function trainerBookKey(configVersion: string | null | undefined): string {
  if (!configVersion) return 'v2|SPY|60';
  const parts = configVersion.split('|');
  if (parts.length >= 3 && parts[0] === 'v2') {
    return `${parts[0]}|${parts[1]}|${parts[2]}`;
  }
  return 'v2|SPY|60';
}

export function trainerBookKeyFromSettings(row: {
  botUnderlying: string;
  signalBarSeconds: number;
}): string {
  return `v2|${row.botUnderlying}|${row.signalBarSeconds}`;
}

/** Schwab sometimes prints the index as SPX while the option root is SPXW. */
export function sameTrainerUnderlying(expected: string, actual: string): boolean {
  if (actual === expected) return true;
  return expected === 'SPXW' && actual === 'SPX';
}

/**
 * Sessions are not one corpus. The prefix keeps a 15-second SPXW run out of
 * a 1-minute SPY story even when the other knobs match.
 */
export function v2ConfigVersion(input: {
  botUnderlying: BotV2Underlying;
  signalBarSeconds: SignalBarSeconds;
  settings: Record<string, unknown>;
}): string {
  const stable: Record<string, unknown> = {};
  for (const key of Object.keys(input.settings).sort()) {
    if (
      key === 'updatedAt' ||
      key === 'id' ||
      key === 'userId' ||
      key === 'rapidProfileAppliedAt'
    ) {
      continue;
    }
    stable[key] = input.settings[key];
  }
  const hash = createHash('sha256')
    .update(JSON.stringify(stable))
    .digest('hex')
    .slice(0, 16);
  return `v2|${input.botUnderlying}|${input.signalBarSeconds}|${hash}`;
}
