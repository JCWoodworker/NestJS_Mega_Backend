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
import { SchwabRealizedTrade } from '@schwab/pnl/entities/schwab-realized-trade.entity';
import { OrderSource } from '@schwab/pnl/enums/order-source.enum';
import { etDateKey, etDayBounds } from '@schwab/pnl/et-date.util';
import { mapAccountBalances } from '@schwab/shared/account-data.mapper';
import { SchwabAccountResolver } from '@schwab/shared/schwab-account-resolver.service';
import { requireUserId } from '@schwab/shared/schwab-user-context';
import { BotEventPayload } from '@schwab/streaming/options.gateway';

import { BotEngineService } from './bot-engine.service';
import {
  DEFAULT_PAPER_EQUITY,
  MIN_EQUITY,
} from './bot-equity-thresholds.const';
import { BotEventService } from './bot-event.service';
import { computePhase } from './bot-phase.util';
import { BotRecordingService } from './bot-recording.service';
import { BotSettingsService } from './bot-settings.service';
import { etNowHhMm, isWithinWindow } from './bot-strategy.util';
import { BotCapitalEventReason } from './entities/bot-capital-event.entity';
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
  /** Equity at session start for the active lane — denominator for the
   * percentage loss/profit gates the desk mirrors. */
  dayStartEquity: number;
  /** Bot-paper ledger (always present; independent of active lane). */
  paperEquity: number;
  paperSettledCash: number;
  minEquityOk: boolean;
  /** Dollar floor used for `minEquityOk` ($5,000 for paper and live). */
  minEquityThreshold: number;
  openPosition: BotOpenPosition | null;
  lastSignal: BotLastSignal | null;
  lastError: string | null;
  todayBotPnl: number;
  tradesToday: number;
  liveArmed: boolean;
  /** Epoch ms new entries unblock, or null when not in cooldown. */
  cooldownUntil: number | null;
  /** False when a premium soft-stop is armed but the engine is not currently
   * getting option bids — the underlying stop still evaluates, the premium
   * one does not. */
  premiumWatchOk: boolean;
  recentEvents: BotEventPayload[];
}

/** How many recent events to embed in `GET /status` for late socket joiners
 * (frontend contract §14j). Full history is `GET /bot/events`. */
const RECENT_EVENTS_COUNT = 20;

/** An armed premium stop is considered unwatched if the soft-exit loop has not
 * read an option bid in this long (heartbeat is ~7s). */
const PREMIUM_WATCH_STALE_MS = 20_000;

function assertMinEquity(equity: number, context: string): void {
  if (equity >= MIN_EQUITY) return;
  throw new BadRequestException(
    `${context} requires at least $${MIN_EQUITY.toLocaleString(
      'en-US',
    )} equity (current: $${equity.toFixed(2)})`,
  );
}

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
  /** Live account figures, per user. A single set of scalars would have
   * reported whichever user's balances were polled last to everyone, and
   * those numbers gate BOT_LIVE entries. */
  private readonly liveBalances = new Map<
    string,
    { equity: number; settledCash: number; dayStartEquity: number }
  >();
  /** Guards the lazy-create-on-first-read below against a boot-time race
   * where two concurrent callers both see no row and both insert one.
   * Keyed by user so one user's insert cannot satisfy another's read. */
  private readonly creatingRows = new Map<string, Promise<BotState>>();

  constructor(
    @InjectRepository(BotState)
    private readonly stateRepository: Repository<BotState>,
    @InjectRepository(SchwabRealizedTrade)
    private readonly realizedRepository: Repository<SchwabRealizedTrade>,
    private readonly httpService: HttpService,
    private readonly accountResolver: SchwabAccountResolver,
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
    @Inject(forwardRef(() => BotEngineService))
    private readonly botEngine: BotEngineService,
    private readonly botSettingsService: BotSettingsService,
    private readonly botEventService: BotEventService,
    private readonly botRecordingService: BotRecordingService,
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

  async getRow(userId = requireUserId()): Promise<BotState> {
    const existing = await this.stateRepository.findOneBy({ userId });
    if (existing) return existing;

    const inFlight = this.creatingRows.get(userId);
    if (inFlight) return inFlight;

    const creating = this.stateRepository
      .save(
        this.stateRepository.create({
          userId,
          mode: BotMode.MANUAL,
          lane: null,
          running: false,
          lockout: false,
          lockoutReason: null,
          liveArmed: false,
        }),
      )
      .finally(() => {
        this.creatingRows.delete(userId);
      });
    this.creatingRows.set(userId, creating);
    return creating;
  }

  /**
   * Users whose bot needs a heartbeat tick.
   *
   * Filtered in SQL rather than by loading every row: a bot left in MANUAL
   * needs no work, and the point of the scan is to keep the per-tick Schwab
   * call volume proportional to users who are actually running.
   */
  async listActiveBotUsers(): Promise<Array<{ userId: string }>> {
    return this.stateRepository.find({
      where: { mode: BotMode.BOT },
      select: { userId: true },
    });
  }

  async save(row: BotState): Promise<BotState> {
    return this.stateRepository.save(row);
  }

  /** Called by AccountSnapshotService / engine with latest live balances. */
  updateLiveBalances(
    equity: number,
    settledCash: number,
    dayStartEquity: number,
    userId = requireUserId(),
  ) {
    this.liveBalances.set(userId, { equity, settledCash, dayStartEquity });
  }

  getLiveBalances(userId = requireUserId()) {
    return (
      this.liveBalances.get(userId) ?? {
        equity: 0,
        settledCash: 0,
        dayStartEquity: 0,
      }
    );
  }

  async getStatus(): Promise<BotStatusView> {
    const row = await this.getRow();
    const isPaper = row.lane === BotLane.BOT_PAPER;
    const live = this.getLiveBalances(row.userId);
    const equity = isPaper ? Number(row.paperEquity) : live.equity;
    const settledCash = isPaper
      ? Number(row.paperSettledCash)
      : live.settledCash;
    const [{ todayBotPnl, tradesToday }, settings, recentEvents] =
      await Promise.all([
        this.todayStats(row.lane),
        this.botSettingsService.getSettings(),
        this.botEventService.recent(RECENT_EVENTS_COUNT),
      ]);

    const now = Date.now();
    const cooldownEndsAt = row.lastTradeAt
      ? row.lastTradeAt.getTime() + settings.cooldownMins * 60_000
      : null;
    const cooldownUntil =
      cooldownEndsAt != null && cooldownEndsAt > now ? cooldownEndsAt : null;

    const nowHhMm = etNowHhMm();
    const phase = computePhase({
      mode: row.mode,
      lane: row.lane,
      lockout: row.lockout,
      hasOpenPosition: !!row.openPosition,
      transientPhase: this.botEngine.getTransientPhase(row.userId),
      withinTradeWindow: isWithinWindow(
        nowHhMm,
        settings.tradeWindowStart,
        settings.tradeWindowEnd,
      ),
      inCooldown: cooldownUntil != null,
    });

    const minEquityThreshold = MIN_EQUITY;
    const premiumArmed = Boolean(
      row.openPosition &&
        (row.openPosition.stopPremium != null ||
          row.openPosition.targetPremium != null),
    );
    const lastPremiumBidAt = this.botEngine.getLastPremiumBidAt(row.userId);
    const premiumWatchOk =
      !premiumArmed ||
      (lastPremiumBidAt != null &&
        now - lastPremiumBidAt <= PREMIUM_WATCH_STALE_MS);

    return {
      mode: row.mode,
      lane: row.lane,
      running: row.running,
      phase,
      lockout: row.lockout,
      lockoutReason: row.lockoutReason,
      equity,
      settledCash,
      dayStartEquity: isPaper
        ? Number(row.paperDayStartEquity)
        : live.dayStartEquity,
      paperEquity: Number(row.paperEquity),
      paperSettledCash: Number(row.paperSettledCash),
      minEquityOk: equity >= minEquityThreshold,
      minEquityThreshold,
      openPosition: row.openPosition,
      lastSignal: row.lastSignal,
      lastError: row.lastError,
      todayBotPnl,
      tradesToday,
      liveArmed: row.liveArmed,
      cooldownUntil,
      premiumWatchOk,
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
      assertMinEquity(this.getLiveBalances().equity, 'BOT_LIVE');
    }
    if (lane === BotLane.BOT_PAPER) {
      const paperRow = await this.getRow();
      assertMinEquity(Number(paperRow.paperEquity), 'BOT_PAPER');
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
    assertMinEquity(this.getLiveBalances().equity, 'BOT_LIVE');
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

  /**
   * Reset the bot-paper ledger to a fixed starting equity (default $6,000).
   * Refuses while a paper position is open so we don't orphan fills.
   */
  async resetPaper(equity = DEFAULT_PAPER_EQUITY): Promise<BotStatusView> {
    if (!Number.isFinite(equity) || equity < MIN_EQUITY) {
      throw new BadRequestException(
        `Paper reset equity must be a number >= $${MIN_EQUITY.toLocaleString(
          'en-US',
        )}`,
      );
    }
    const row = await this.getRow();
    if (row.openPosition && row.openPosition.source === BotLane.BOT_PAPER) {
      throw new ConflictException(
        'Flatten the open BOT_PAPER position before resetting paper capital',
      );
    }
    const before = {
      paperEquity: Number(row.paperEquity),
      paperSettledCash: Number(row.paperSettledCash),
      paperDayStartEquity: Number(row.paperDayStartEquity),
    };
    row.paperEquity = equity;
    row.paperSettledCash = equity;
    row.paperDayStartEquity = equity;
    await this.save(row);
    await this.botEventService.record({
      lane: row.lane,
      type: BotEventType.OPERATOR_SETTINGS,
      reason: 'PAPER_RESET',
      payload: {
        before,
        after: {
          paperEquity: equity,
          paperSettledCash: equity,
          paperDayStartEquity: equity,
        },
      },
    });
    // Ledger the injection separately from the event feed: events are trimmed
    // at 30 days, and cumulative performance is derived as
    // `balance − starting capital − Σ injections`, so losing a reset would make
    // the equity curve permanently overstate results.
    await this.botRecordingService.recordCapitalEvent({
      reason: BotCapitalEventReason.MANUAL_RESET,
      lane: row.lane,
      balanceBefore: before.paperEquity,
      balanceAfter: equity,
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
    return this.accountResolver.resolve();
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
