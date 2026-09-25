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

import { DEFAULT_PAPER_EQUITY } from './bot-equity-thresholds.const';
import { BotEventService } from './bot-event.service';
import { BotSettingsService } from './bot-settings.service';
import { BotStateService } from './bot-state.service';
import { KillDto } from './dto/kill.dto';
import { ListEventsDto } from './dto/list-events.dto';
import { ListSettingsHistoryDto } from './dto/list-settings-history.dto';
import { LiveEnableDto } from './dto/live-enable.dto';
import { ResetPaperDto } from './dto/reset-paper.dto';
import { SetLaneDto } from './dto/set-lane.dto';
import { SetModeDto } from './dto/set-mode.dto';
import { UpdateBotSettingsDto } from './dto/update-bot-settings.dto';
import { BotSettingsSnapshotSource } from './entities/bot-settings-snapshot.entity';
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
      const mode =
        (lastDecision.payload as any)?.combineMode ?? settings.combineMode;
      summary =
        `SCANNING: last candles NO_SIGNAL (${mode} ` +
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
      summary = `${status.phase}: armed, waiting for strategy signal (${settings.combineMode})`;
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

  /**
   * Apply suggested settings for current equity and record a durable
   * settings snapshot tagged `source: suggested`. Prefer this over PUT
   * when the operator taps Apply suggested.
   */
  @Post('settings/apply-suggested')
  @HttpCode(HttpStatus.OK)
  async applySuggestedSettings() {
    const status = await this.botStateService.getStatus();
    return this.botSettingsService.applySuggested(status.equity);
  }

  /**
   * Durable settings history (not trimmed with bot_events). Used by weekly
   * rollups to attribute P&L to the settings in force during each period.
   */
  @Get('settings/history')
  async getSettingsHistory(@Query() query: ListSettingsHistoryDto) {
    return this.botSettingsService.listHistory(query);
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

  /** Reset bot-paper ledger to a starting equity (default $6,000). */
  @Post('paper/reset')
  @HttpCode(HttpStatus.OK)
  async resetPaper(@Body() dto: ResetPaperDto) {
    return this.botStateService.resetPaper(dto.equity ?? DEFAULT_PAPER_EQUITY);
  }

  @Get('settings')
  async getSettings() {
    return this.botSettingsService.getSettings();
  }

  @Put('settings')
  async updateSettings(@Body() dto: UpdateBotSettingsDto) {
    // Default attribution is manual; FE Apply suggested should use
    // POST /settings/apply-suggested or pass source:'suggested'.
    return this.botSettingsService.updateSettings({
      ...dto,
      source: dto.source ?? BotSettingsSnapshotSource.MANUAL,
    });
  }
}
