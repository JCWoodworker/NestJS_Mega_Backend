import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';

import schwabConfig from '@schwab/config/schwab.config';
import { OrdersService } from '@schwab/orders/orders.service';
import { SchwabRealizedTrade } from '@schwab/pnl/entities/schwab-realized-trade.entity';
import { OrderSource } from '@schwab/pnl/enums/order-source.enum';
import { etDateKey, etDayBounds } from '@schwab/pnl/et-date.util';
import { mapAccountBalances } from '@schwab/shared/account-data.mapper';
import { BotEventPayload } from '@schwab/streaming/options.gateway';

import { BotEngineService } from './bot-engine.service';
import { BotEventService } from './bot-event.service';
import { computePhase } from './bot-phase.util';
import { BotSettingsService } from './bot-settings.service';
import { etNowHhMm, isWithinWindow } from './bot-strategy.util';
import {
  BotLastSignal,
  BotOpenPosition,
  BotState,
} from './entities/bot-state.entity';
import { BotEventType, BotPhase } from './enums/bot-event-type.enum';
import { BotLane } from './enums/bot-lane.enum';
import { BotMode } from './enums/bot-mode.enum';
import { KillScope } from './enums/kill-scope.enum';

export interface BotStatusView {
  mode: BotMode;
  lane: BotLane | null;
  running: boolean;
  phase: BotPhase;
  lockout: boolean;
  lockoutReason: string | null;
  equity: number;
  settledCash: number;
  minEquityOk: boolean;
  openPosition: BotOpenPosition | null;
  lastSignal: BotLastSignal | null;
  lastError: string | null;
  todayBotPnl: number;
  tradesToday: number;
  liveArmed: boolean;
  recentEvents: BotEventPayload[];
}

/** How many recent events to embed in `GET /status` for late socket joiners
 * (frontend contract §14j). Full history is `GET /bot/events`. */
const RECENT_EVENTS_COUNT = 20;

const MIN_EQUITY = 100;

/**
 * Lockout reasons an operator can clear same-session via `POST /bot/unlock`
 * (kill switch / precautionary halts). Risk-limit and reconciliation halts
 * (max-loss, profit targets, recon mismatch) are deliberately excluded —
 * clearing those same-day needs an explicit product decision, not a single
 * curl, so they still only clear via the next trading day's rollover
 * (`clearLockoutIfNewDay`).
 */
const OPERATOR_UNLOCKABLE_REASONS = new Set([
  'KILL_SWITCH',
  'LIVE_DISABLED',
  'HARD_FLATTEN_EOD',
  'SOCKET_LOSS',
]);

@Injectable()
export class BotStateService {
  private readonly logger = new Logger(BotStateService.name);
  private cachedAccountHash: string | null = null;
  private liveEquity = 0;
  private liveSettledCash = 0;
  private liveDayStartEquity = 0;
  /** Guards the lazy-create-on-first-read below against a boot-time race
   * where two concurrent callers both see no row and both insert one. */
  private creatingRow: Promise<BotState> | null = null;

  constructor(
    @InjectRepository(BotState)
    private readonly stateRepository: Repository<BotState>,
    @InjectRepository(SchwabRealizedTrade)
    private readonly realizedRepository: Repository<SchwabRealizedTrade>,
    private readonly httpService: HttpService,
    private readonly ordersService: OrdersService,
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
    @Inject(forwardRef(() => BotEngineService))
    private readonly botEngine: BotEngineService,
    private readonly botSettingsService: BotSettingsService,
    private readonly botEventService: BotEventService,
  ) {}

  /** Polled from BotEngineService's heartbeat — keeps equity/settledCash
   * fresh for BOT_LIVE min-equity/budget checks without a second dedicated
   * poller (AccountSnapshotService already does the same fetch for the
   * frontend socket, but living in a different module — see plan §4). */
  async refreshLiveBalances(): Promise<void> {
    try {
      const accountHash = await this.resolveAccountHash();
      const response = await firstValueFrom(
        this.httpService.get(`/trader/v1/accounts/${accountHash}`, {
          params: { fields: 'positions' },
        }),
      );
      const balances = mapAccountBalances(response.data);
      this.updateLiveBalances(
        balances.equity,
        balances.settledCash,
        balances.dayStartEquity,
      );
    } catch (err) {
      this.logger.debug(`refreshLiveBalances skipped: ${err.message}`);
    }
  }

  async getRow(): Promise<BotState> {
    const [existing] = await this.stateRepository.find({
      take: 1,
      order: { updatedAt: 'DESC' },
    });
    if (existing) return existing;

    if (!this.creatingRow) {
      this.creatingRow = this.stateRepository
        .save(
          this.stateRepository.create({
            mode: BotMode.MANUAL,
            lane: null,
            running: false,
            lockout: false,
            lockoutReason: null,
            liveArmed: false,
          }),
        )
        .finally(() => {
          this.creatingRow = null;
        });
    }
    return this.creatingRow;
  }

  async save(row: BotState): Promise<BotState> {
    return this.stateRepository.save(row);
  }

  /** Called by AccountSnapshotService / engine with latest live balances. */
  updateLiveBalances(
    equity: number,
    settledCash: number,
    dayStartEquity: number,
  ) {
    this.liveEquity = equity;
    this.liveSettledCash = settledCash;
    this.liveDayStartEquity = dayStartEquity;
  }

  getLiveBalances() {
    return {
      equity: this.liveEquity,
      settledCash: this.liveSettledCash,
      dayStartEquity: this.liveDayStartEquity,
    };
  }

  async getStatus(): Promise<BotStatusView> {
    const row = await this.getRow();
    const isPaper = row.lane === BotLane.BOT_PAPER;
    const equity = isPaper ? Number(row.paperEquity) : this.liveEquity;
    const settledCash = isPaper
      ? Number(row.paperSettledCash)
      : this.liveSettledCash;
    const [{ todayBotPnl, tradesToday }, settings, recentEvents] =
      await Promise.all([
        this.todayStats(row.lane),
        this.botSettingsService.getSettings(),
        this.botEventService.recent(RECENT_EVENTS_COUNT),
      ]);

    const nowHhMm = etNowHhMm();
    const phase = computePhase({
      mode: row.mode,
      lane: row.lane,
      lockout: row.lockout,
      hasOpenPosition: !!row.openPosition,
      transientPhase: this.botEngine.getTransientPhase(),
      withinTradeWindow: isWithinWindow(
        nowHhMm,
        settings.tradeWindowStart,
        settings.tradeWindowEnd,
      ),
      inCooldown: Boolean(
        row.lastTradeAt &&
          Date.now() - row.lastTradeAt.getTime() <
            settings.cooldownMins * 60_000,
      ),
    });

    return {
      mode: row.mode,
      lane: row.lane,
      running: row.running,
      phase,
      lockout: row.lockout,
      lockoutReason: row.lockoutReason,
      equity,
      settledCash,
      minEquityOk: equity >= MIN_EQUITY,
      openPosition: row.openPosition,
      lastSignal: row.lastSignal,
      lastError: row.lastError,
      todayBotPnl,
      tradesToday,
      liveArmed: row.liveArmed,
      recentEvents,
    };
  }

  /**
   * Lockout is a per-trading-day breaker, not a permanent one — this clears
   * a stale lockout at the first check after ET midnight so the bot doesn't
   * require manual DB intervention to resume the next session. Called from
   * the engine's heartbeat and defensively from `setMode`/`setLane` so a
   * control-plane action right at rollover isn't stuck on heartbeat lag.
   */
  async clearLockoutIfNewDay(): Promise<boolean> {
    const row = await this.getRow();
    if (!row.lockout) return false;
    const today = etDateKey();
    if (row.lockoutDateKey === today) return false;

    row.lockout = false;
    row.lockoutReason = null;
    row.lockoutDateKey = null;
    if (row.lane === BotLane.BOT_PAPER) {
      row.paperDayStartEquity = row.paperEquity;
    }
    await this.save(row);
    await this.botEventService.record({
      lane: row.lane,
      type: BotEventType.UNLOCK,
      reason: 'NEW_TRADING_DAY',
    });
    return true;
  }

  async setMode(mode: BotMode): Promise<BotStatusView> {
    await this.clearLockoutIfNewDay();
    const row = await this.getRow();
    const from = row.mode;
    row.mode = mode;
    if (mode === BotMode.MANUAL) {
      row.running = false;
    } else if (mode === BotMode.BOT && row.lane && !row.lockout) {
      row.running = true;
    } else {
      row.running = false;
    }
    await this.save(row);
    await this.botEventService.record({
      lane: row.lane,
      type: BotEventType.OPERATOR_MODE,
      reason: `${from} → ${mode}`,
      payload: { from, to: mode, running: row.running },
    });
    this.botEngine.onControlPlaneChange();
    return this.getStatus();
  }

  async setLane(lane: BotLane, confirmLive?: boolean): Promise<BotStatusView> {
    await this.clearLockoutIfNewDay();
    if (lane === BotLane.BOT_LIVE && confirmLive !== true) {
      throw new BadRequestException('BOT_LIVE requires confirmLive: true');
    }
    if (lane === BotLane.BOT_LIVE) {
      const armedCheck = await this.getRow();
      if (!armedCheck.liveArmed) {
        throw new BadRequestException(
          'BOT_LIVE requires live to be armed via POST /bot/live/enable',
        );
      }
    }

    const row = await this.getRow();
    if (row.openPosition && row.lane && row.lane !== lane) {
      throw new ConflictException(
        'Must flatten current lane before switching — open bot position exists',
      );
    }

    const from = row.lane;
    row.lane = lane;
    if (row.mode === BotMode.BOT && !row.lockout) {
      row.running = true;
    }
    await this.save(row);
    await this.botEventService.record({
      lane: row.lane,
      type: BotEventType.OPERATOR_LANE,
      reason: `${from ?? 'null'} → ${lane}`,
      payload: { from, to: lane },
    });
    this.botEngine.onControlPlaneChange();
    return this.getStatus();
  }

  async enableLive(confirm: true): Promise<BotStatusView> {
    if (confirm !== true) {
      throw new BadRequestException('confirm must be true');
    }
    const row = await this.getRow();
    row.liveArmed = true;
    await this.save(row);
    await this.botEventService.record({
      lane: row.lane,
      type: BotEventType.OPERATOR_LIVE,
      reason: 'LIVE_ARMED',
      payload: { liveArmed: true },
    });
    this.botEngine.onControlPlaneChange();
    return this.getStatus();
  }

  async disableLive(): Promise<BotStatusView> {
    const row = await this.getRow();
    if (row.lane === BotLane.BOT_LIVE) {
      await this.botEngine.flattenAndHalt('LIVE_DISABLED', KillScope.LIVE);
    }
    const refreshed = await this.getRow();
    refreshed.liveArmed = false;
    if (refreshed.lane === BotLane.BOT_LIVE) {
      refreshed.lane = null;
      refreshed.running = false;
    }
    await this.save(refreshed);
    await this.botEventService.record({
      lane: refreshed.lane,
      type: BotEventType.OPERATOR_LIVE,
      reason: 'LIVE_DISARMED',
      payload: { liveArmed: false },
    });
    this.botEngine.onControlPlaneChange();
    return this.getStatus();
  }

  async kill(scope: KillScope): Promise<BotStatusView> {
    await this.botEngine.flattenAndHalt('KILL_SWITCH', scope);
    return this.getStatus();
  }

  /**
   * Operator recovery path for a kill-switch / precautionary lockout — see
   * `OPERATOR_UNLOCKABLE_REASONS`. Distinct from `clearLockoutIfNewDay`:
   * this clears the lockout immediately, in the same trading session,
   * on explicit operator request rather than waiting for ET midnight.
   */
  async unlock(): Promise<BotStatusView> {
    const row = await this.getRow();
    if (!row.lockout) return this.getStatus();

    if (
      row.lockoutReason &&
      !OPERATOR_UNLOCKABLE_REASONS.has(row.lockoutReason)
    ) {
      throw new ConflictException(
        `Cannot unlock a "${row.lockoutReason}" lockout via this endpoint — ` +
          'risk-limit and reconciliation halts require a product decision ' +
          'or the next trading day to clear.',
      );
    }

    row.lockout = false;
    row.lockoutReason = null;
    row.lockoutDateKey = null;
    if (row.mode === BotMode.BOT && row.lane) {
      row.running = true;
    }
    await this.save(row);
    await this.botEventService.record({
      lane: row.lane,
      type: BotEventType.UNLOCK,
      reason: 'OPERATOR_UNLOCK',
    });
    this.botEngine.onControlPlaneChange();
    return this.getStatus();
  }

  async resolveAccountHash(): Promise<string> {
    if (this.config.accountHash) return this.config.accountHash;
    if (this.cachedAccountHash) return this.cachedAccountHash;
    const accounts = await this.ordersService.listAccounts();
    if (!accounts.length) {
      throw new Error('No Schwab accounts linked to this app yet');
    }
    this.cachedAccountHash = accounts[0].hashValue;
    return this.cachedAccountHash;
  }

  private async todayStats(
    lane: BotLane | null,
  ): Promise<{ todayBotPnl: number; tradesToday: number }> {
    if (!lane) return { todayBotPnl: 0, tradesToday: 0 };
    try {
      const accountHash = await this.resolveAccountHash();
      const source =
        lane === BotLane.BOT_PAPER
          ? OrderSource.BOT_PAPER
          : OrderSource.BOT_LIVE;
      const day = etDateKey();
      const { start, end } = etDayBounds(day);
      const rows = await this.realizedRepository.find({
        where: { accountHash, source },
      });
      const today = rows.filter((r) => r.closedAt >= start && r.closedAt < end);
      return {
        todayBotPnl: today.reduce((s, r) => s + Number(r.realizedPnl), 0),
        tradesToday: today.length,
      };
    } catch {
      return { todayBotPnl: 0, tradesToday: 0 };
    }
  }
}
