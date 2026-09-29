import { Body, Controller, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { BotStateService } from '@schwab/bot/bot-state.service';
import { requireUserId } from '@schwab/shared/schwab-user-context';

import { BotV2EngineService } from './bot-v2-engine.service';
import { BotV2SettingsService } from './bot-v2-settings.service';
import { BotV2StateService } from './bot-v2-state.service';
import { ArmBotV2Dto, UpdateBotV2SettingsDto } from './dto/bot-v2.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotV2Trade } from './entities/bot-v2-trade.entity';

@Throttle({ default: { limit: 120, ttl: 60000 } })
@Controller('bot-v2')
export class BotV2Controller {
  constructor(
    private readonly engine: BotV2EngineService,
    private readonly settingsService: BotV2SettingsService,
    private readonly stateService: BotV2StateService,
    private readonly champion: BotStateService,
    @InjectRepository(BotV2Trade)
    private readonly trades: Repository<BotV2Trade>,
  ) {}

  @Get('status')
  async status() {
    const userId = requireUserId();
    const [state, settings, champion] = await Promise.all([
      this.stateService.get(userId),
      this.settingsService.get(userId),
      this.champion.getRow(userId),
    ]);
    return {
      mode: state.mode,
      running: state.running,
      lockout: state.lockout,
      lockoutReason: state.lockoutReason,
      lane: state.mode === 'BOT' ? 'BOT_PAPER' : null,
      paperEquity: Number(state.paperEquity),
      paperSettledCash: Number(state.paperSettledCash),
      openPosition: state.openPosition,
      botUnderlying: settings.botUnderlying,
      signalBarSeconds: settings.signalBarSeconds,
      useRiskAtStop: settings.useRiskAtStop,
      maxRiskUsd: Number(settings.maxRiskUsd),
      useScaleOut: settings.useScaleOut,
      championMode: champion.mode,
    };
  }

  @Get('settings')
  async getSettings() {
    return this.settingsService.get();
  }

  @Put('settings')
  async updateSettings(@Body() dto: UpdateBotV2SettingsDto) {
    return this.settingsService.update(dto);
  }

  @Post('arm')
  @HttpCode(200)
  async arm(@Body() _dto: ArmBotV2Dto) {
    await this.engine.arm();
    return this.status();
  }

  @Post('stop')
  @HttpCode(200)
  async stop() {
    await this.engine.stop('STOP');
    return this.status();
  }

  @Get('trades')
  async listTrades(@Query('limit') limit?: string) {
    const userId = requireUserId();
    const take = Math.min(100, Math.max(1, Number(limit) || 50));
    return this.trades.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take,
    });
  }
}
