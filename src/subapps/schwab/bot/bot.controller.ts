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
import { BotEventType } from './enums/bot-event-type.enum';

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
    return this.botEventService.list(query);
  }

  /**
   * One-glance "why idle / what's happening" for the status strip — no LLM.
   * Uses recent decision-audit events + current status/settings.
   */
  @Get('explain')
  async explain() {
    const status = await this.botStateService.getStatus();
    const [settings, events, suggested] = await Promise.all([
      this.botSettingsService.getSettings(),
      this.botEventService.recent(40),
      this.botSettingsService.getSuggested(status.equity),
    ]);

    const decisionEvents = events.filter((e) =>
      [
        BotEventType.NO_SIGNAL,
        BotEventType.GATE_SKIP,
        BotEventType.SIGNAL,
        BotEventType.SKIP,
        BotEventType.ERROR,
      ].includes(e.type as BotEventType),
    );
    const lastDecision = decisionEvents[0] ?? null;
    const noSignalCount = decisionEvents.filter(
      (e) => e.type === BotEventType.NO_SIGNAL,
    ).length;

    let summary: string;
    if (status.phase === 'LOCKOUT') {
      summary = `LOCKOUT: ${status.lockoutReason ?? 'unknown'}`;
    } else if (status.phase === 'STOPPED') {
      summary = 'STOPPED: mode is MANUAL or no lane selected';
    } else if (status.openPosition) {
      summary = `IN_POSITION: ${status.openPosition.symbol} x${status.openPosition.quantity}`;
    } else if (lastDecision?.type === BotEventType.NO_SIGNAL) {
      const results = (lastDecision.payload as any)?.results ?? {};
      summary =
        `SCANNING: last candles NO_SIGNAL (CONFIRMING ` +
        `VWAP=${results.VWAP_PULLBACK ?? 'n/a'} ORB=${
          results.ORB_5M ?? 'n/a'
        }); ` +
        `directions ${settings.directionsEnabled.join('+') || 'none'}` +
        (noSignalCount > 1 ? ` — ${noSignalCount} recent NO_SIGNAL rows` : '');
    } else if (lastDecision?.type === BotEventType.GATE_SKIP) {
      summary = `SCANNING blocked: GATE_SKIP ${lastDecision.reason}`;
    } else if (status.phase === 'WAITING_WINDOW') {
      summary = `WAITING_WINDOW: outside ${settings.tradeWindowStart}–${settings.tradeWindowEnd} ET`;
    } else if (status.phase === 'COOLDOWN') {
      summary = `COOLDOWN: ${settings.cooldownMins}m after last trade`;
    } else {
      summary = `${status.phase}: armed, waiting for confirming signal`;
    }

    if (Object.keys(suggested.patch).length > 0) {
      summary += ` — settings look aggressive for ${suggested.tier} equity (see /bot/settings/suggested)`;
    }

    return {
      phase: status.phase,
      summary,
      status,
      settings,
      lastDecision,
      recentDecisions: decisionEvents.slice(0, 20),
      suggestedTier: suggested.tier,
      suggestedHint:
        Object.keys(suggested.patch).length > 0
          ? `Apply suggested ${suggested.tier} settings via GET /bot/settings/suggested`
          : null,
    };
  }

  @Get('settings/suggested')
  async getSuggestedSettings() {
    const status = await this.botStateService.getStatus();
    return this.botSettingsService.getSuggested(status.equity);
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
