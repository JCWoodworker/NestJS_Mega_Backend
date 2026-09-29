import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { requireUserId } from '@schwab/shared/schwab-user-context';

import { BotV2Settings } from './entities/bot-v2-settings.entity';
import { isSignalBarSeconds } from './bot-v2-bars.util';
import { isBotV2Underlying } from './bot-v2-config.util';

@Injectable()
export class BotV2SettingsService {
  constructor(
    @InjectRepository(BotV2Settings)
    private readonly settings: Repository<BotV2Settings>,
  ) {}

  async get(userId = requireUserId()): Promise<BotV2Settings> {
    const existing = await this.settings.findOneBy({ userId });
    if (existing) return existing;
    return this.settings.save(
      this.settings.create({
        userId,
        useRiskAtStop: false,
        maxRiskUsd: 200,
        signalBarSeconds: 60,
        useScaleOut: false,
        botUnderlying: 'SPY',
        trailArmPct: 8,
        trailPct: 15,
        trailMinLockPct: 5,
      }),
    );
  }

  async update(
    patch: Partial<BotV2Settings>,
    userId = requireUserId(),
  ): Promise<BotV2Settings> {
    const row = await this.get(userId);
    if (patch.botUnderlying != null && !isBotV2Underlying(String(patch.botUnderlying))) {
      throw new BadRequestException('FUTURES_QUOTE_UNAVAILABLE');
    }
    if (
      patch.signalBarSeconds != null &&
      !isSignalBarSeconds(Number(patch.signalBarSeconds))
    ) {
      throw new BadRequestException('SIGNAL_BAR_SECONDS');
    }
    if (patch.useRiskAtStop && !(Number(patch.maxRiskUsd ?? row.maxRiskUsd) > 0)) {
      throw new BadRequestException('MAX_RISK_USD');
    }
    const arm = Number(patch.trailArmPct ?? row.trailArmPct);
    const lock = Number(patch.trailMinLockPct ?? row.trailMinLockPct);
    if (lock >= arm) {
      throw new BadRequestException('LOCK_MUST_BE_BELOW_ARM');
    }
    Object.assign(row, patch);
    return this.settings.save(row);
  }
}
