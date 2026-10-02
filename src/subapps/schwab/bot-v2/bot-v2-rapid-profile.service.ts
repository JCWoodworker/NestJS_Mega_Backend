import { Injectable, Logger } from '@nestjs/common';

import { BotStrategy } from '@schwab/bot/enums/strategy.enum';

import { BotV2SettingsService } from './bot-v2-settings.service';
import { BotV2StateService } from './bot-v2-state.service';

/** Friday 2026-10-02 4:00 PM ET. The profile is saved once after this instant. */
export const RAPID_PROFILE_NOT_BEFORE_MS = Date.parse('2026-10-02T16:00:00-04:00');

/**
 * One-shot switch of the owner's house trainer onto the SPXW profile.
 * It waits until the trainer is flat, then never runs again.
 */
@Injectable()
export class BotV2RapidProfileService {
  private readonly logger = new Logger(BotV2RapidProfileService.name);

  constructor(
    private readonly settings: BotV2SettingsService,
    private readonly state: BotV2StateService,
  ) {}

  async applyIfDue(ownerUserId: string, now = Date.now()): Promise<boolean> {
    if (now < RAPID_PROFILE_NOT_BEFORE_MS) return false;
    const row = await this.settings.get(ownerUserId);
    if (row.rapidProfileAppliedAt) return false;
    const book = await this.state.get(ownerUserId);
    if (book.openPosition) return false;
    if (book.mode === 'BOT' && book.running) return false;

    const strategies = row.strategiesEnabled.map((id) =>
      id === BotStrategy.ORB_5M ? BotStrategy.ORB_5M_CROSS : id,
    );
    if (!strategies.includes(BotStrategy.ORB_5M_CROSS)) {
      strategies.push(BotStrategy.ORB_5M_CROSS);
    }

    await this.settings.update(
      {
        botUnderlying: 'SPXW',
        signalBarSeconds: 15,
        useScaleOut: true,
        useRiskAtStop: true,
        maxRiskUsd: 800,
        useTimeStop: true,
        timeStopSeconds: 180,
        strategiesEnabled: [...new Set(strategies)],
        rapidProfileAppliedAt: new Date(now),
      },
      ownerUserId,
    );
    this.logger.log('Saved the SPXW trainer profile for Monday');
    return true;
  }
}
