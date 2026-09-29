import { createHash } from 'crypto';

import { SignalBarSeconds } from './bot-v2-bars.util';

export type BotV2Underlying = 'SPY' | 'SPXW';

export function isBotV2Underlying(value: string): value is BotV2Underlying {
  return value === 'SPY' || value === 'SPXW';
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
    if (key === 'updatedAt' || key === 'id' || key === 'userId') continue;
    stable[key] = input.settings[key];
  }
  const hash = createHash('sha256')
    .update(JSON.stringify(stable))
    .digest('hex')
    .slice(0, 16);
  return `v2|${input.botUnderlying}|${input.signalBarSeconds}|${hash}`;
}
