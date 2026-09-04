import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { BotEventService } from './bot-event.service';
import { BotSettingsService } from './bot-settings.service';
import { BotStateService } from './bot-state.service';
import { KillDto } from './dto/kill.dto';
import { ListEventsDto } from './dto/list-events.dto';
import { LiveEnableDto } from './dto/live-enable.dto';
import { SetLaneDto } from './dto/set-lane.dto';
import { SetModeDto } from './dto/set-mode.dto';
import { UpdateBotSettingsDto } from './dto/update-bot-settings.dto';

@Throttle({ default: { limit: 120, ttl: 60000 } })
@Controller('bot')
export class BotController {
  constructor(
    private readonly botStateService: BotStateService,
    private readonly botSettingsService: BotSettingsService,
    private readonly botEventService: BotEventService,
  ) {}

  @Get('status')
  async getStatus() {
    return this.botStateService.getStatus();
  }

  @Get('events')
  async getEvents(@Query() query: ListEventsDto) {
    return this.botEventService.list(query.limit ?? 100, query.afterId);
  }

  @Post('mode')
  @HttpCode(HttpStatus.OK)
  async setMode(@Body() dto: SetModeDto) {
    return this.botStateService.setMode(dto.mode);
  }

  @Post('lane')
  @HttpCode(HttpStatus.OK)
  async setLane(@Body() dto: SetLaneDto) {
    return this.botStateService.setLane(dto.lane, dto.confirmLive);
  }

  @Post('kill')
  @HttpCode(HttpStatus.OK)
  async kill(@Body() dto: KillDto) {
    return this.botStateService.kill(dto.scope);
  }

  /** Operator recovery from a kill-switch / precautionary lockout — same
   * session, no waiting for the next trading day. See BotStateService.unlock
   * for which lockout reasons are eligible. */
  @Post('unlock')
  @HttpCode(HttpStatus.OK)
  async unlock() {
    return this.botStateService.unlock();
  }

  @Post('live/enable')
  @HttpCode(HttpStatus.OK)
  async enableLive(@Body() dto: LiveEnableDto) {
    return this.botStateService.enableLive(dto.confirm);
  }

  @Post('live/disable')
  @HttpCode(HttpStatus.OK)
  async disableLive() {
    return this.botStateService.disableLive();
  }

  @Get('settings')
  async getSettings() {
    return this.botSettingsService.getSettings();
  }

  @Put('settings')
  async updateSettings(@Body() dto: UpdateBotSettingsDto) {
    return this.botSettingsService.updateSettings(dto);
  }
}
