import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';

import { BotStateService } from '@schwab/bot/bot-state.service';
import schwabConfig from '@schwab/config/schwab.config';
import { etDateKey, etDayBounds } from '@schwab/pnl/et-date.util';
import { requireUserId } from '@schwab/shared/schwab-user-context';

import { BotV2CalendarService } from './bot-v2-calendar.service';
import { BotV2EngineService } from './bot-v2-engine.service';
import { BotV2SettingsService } from './bot-v2-settings.service';
import { BotV2StateService } from './bot-v2-state.service';
import { ArmBotV2Dto, UpdateBotV2SettingsDto } from './dto/bot-v2.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotV2Event } from './entities/bot-v2-event.entity';
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
    @InjectRepository(BotV2Event)
    private readonly events: Repository<BotV2Event>,
    private readonly calendar: BotV2CalendarService,
    @Inject(schwabConfig.KEY)
    private readonly schwab: ConfigType<typeof schwabConfig>,
  ) {}

  @Get('status')
  async status() {
    const userId = requireUserId();
    const [state, settings, champion, today] = await Promise.all([
      this.stateService.get(userId),
      this.settingsService.get(userId),
      this.champion.getRow(userId),
      this.todayStats(userId),
    ]);
    return {
      mode: state.mode,
      running: state.running,
      lockout: state.lockout,
      lockoutReason: state.lockoutReason,
      lane: state.mode === 'BOT' ? 'BOT_PAPER' : null,
      paperEquity: Number(state.paperEquity),
      paperSettledCash: Number(state.paperSettledCash),
      equity: Number(state.paperEquity),
      settledCash: Number(state.paperSettledCash),
      minEquityOk: Number(state.paperEquity) >= 0,
      minEquityThreshold: 0,
      openPosition: state.openPosition
        ? { ...state.openPosition, source: 'BOT_PAPER' as const }
        : null,
      lastSignal: null,
      lastError: null,
      todayBotPnl: today.todayBotPnl,
      tradesToday: today.tradesToday,
      liveArmed: false,
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
    const row = await this.settingsService.get();
    return this.settingsService.toDeskView(row);
  }

  @Put('settings')
  async updateSettings(@Body() dto: UpdateBotV2SettingsDto) {
    const row = await this.settingsService.update(dto);
    return this.settingsService.toDeskView(row);
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

  @Post('reset')
  @HttpCode(200)
  async resetPaper() {
    const userId = requireUserId();
    const row = await this.stateService.get(userId);
    if (row.openPosition) {
      throw new ConflictException(
        'Flatten the open position before resetting paper capital',
      );
    }
    const before = Number(row.paperEquity);
    await this.calendar.recordTopUp(userId, before);
    row.paperEquity = 10000;
    row.paperSettledCash = 10000;
    await this.stateService.save(row);
    return this.status();
  }

  @Get('calendar')
  calendarMonth(
    @Query('month') month?: string,
    @Query('book') book?: string,
    @Query('includeTrainer') includeTrainer?: string,
  ) {
    const userId = requireUserId();
    const requested = book || 'all';
    return this.calendar.month(
      userId,
      month ?? '',
      requested,
      this.withTrainer(userId, requested, includeTrainer),
    );
  }

  @Get('calendar/day')
  calendarDay(
    @Query('date') date?: string,
    @Query('book') book?: string,
    @Query('includeTrainer') includeTrainer?: string,
  ) {
    const userId = requireUserId();
    const requested = book || 'all';
    return this.calendar.day(
      userId,
      date ?? '',
      requested,
      this.withTrainer(userId, requested, includeTrainer),
    );
  }

  @Put('calendar/notes')
  saveCalendarNote(
    @Body() body: { grain?: string; periodKey?: string; text?: string | null },
  ) {
    return this.calendar.saveNote(
      requireUserId(),
      body.grain ?? '',
      body.periodKey ?? '',
      body.text ?? null,
    );
  }

  @Get('events')
  async listEvents(
    @Query('limit') limit?: string,
    @Query('beforeId') beforeId?: string,
  ) {
    const userId = requireUserId();
    const take = Math.min(100, Math.max(1, Number(limit) || 50));
    const qb = this.events
      .createQueryBuilder('e')
      .where('e.user_id = :userId', { userId })
      .orderBy('e.created_at', 'DESC')
      .take(take);
    if (beforeId) {
      const cursor = await this.events.findOneBy({ id: beforeId, userId });
      if (cursor) qb.andWhere('e.created_at < :before', { before: cursor.createdAt });
    }
    const rows = await qb.getMany();
    const items = rows.map((row) => ({
      id: row.id,
      at: row.createdAt.getTime(),
      lane: 'BOT_PAPER' as const,
      type: row.type,
      reason: row.reason,
      payload: row.payload,
    }));
    return {
      items,
      limit: take,
      nextBeforeId: items.at(-1)?.id ?? null,
      nextAfterId: items[0]?.id ?? null,
      hasMoreOlder: items.length === take,
      hasMoreNewer: false,
    };
  }

  /** Trainer dollars belong to the owner account. Everyone else's calendar is their own books. */
  private withTrainer(userId: string, book: string, includeTrainer?: string): boolean {
    const owner = this.schwab.ownerUserId;
    const isOwner = Boolean(owner) && userId === owner;
    if (book === 'trainer' && !isOwner) {
      throw new ForbiddenException('Trainer results stay on the admin account');
    }
    if (book === 'trainer') return true;
    return book === 'all' && isOwner && includeTrainer === '1';
  }

  /** Realized net and close count for the current America/New_York calendar day. */
  private async todayStats(
    userId: string,
  ): Promise<{ todayBotPnl: number; tradesToday: number }> {
    const { start, end } = etDayBounds(etDateKey());
    const raw = await this.trades
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.net_pnl), 0)', 'pnl')
      .addSelect('COUNT(*)', 'n')
      .where('t.user_id = :userId', { userId })
      .andWhere('t.closed_at::bigint >= :start', { start: start.getTime() })
      .andWhere('t.closed_at::bigint < :end', { end: end.getTime() })
      .getRawOne<{ pnl: string; n: string }>();
    return {
      todayBotPnl: Math.round(Number(raw?.pnl ?? 0) * 100) / 100,
      tradesToday: Number(raw?.n ?? 0),
    };
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
