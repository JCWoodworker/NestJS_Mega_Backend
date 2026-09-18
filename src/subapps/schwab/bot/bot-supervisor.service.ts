import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import schwabConfig from '@schwab/config/schwab.config';
import { etDateKey } from '@schwab/pnl/et-date.util';
import { runAsUser } from '@schwab/shared/schwab-user-context';

import { MIN_EQUITY } from './bot-equity-thresholds.const';
import { BotEventService } from './bot-event.service';
import { BotStateService } from './bot-state.service';
import { etNowHhMm, isAtOrPast } from './bot-strategy.util';
import { BotEventType } from './enums/bot-event-type.enum';
import { BotLane } from './enums/bot-lane.enum';
import { BotMode } from './enums/bot-mode.enum';
import { KillScope } from './enums/kill-scope.enum';
import {
  isBeyondCalendarCoverage,
  isMarketHoliday,
  isTradingDay,
  isWeekend,
} from './trading-calendar.util';

const TICK_MS = 60_000;

/** Machine-readable reason the supervisor will not arm. */
export type SupervisorBlockerCode =
  | 'SUPERVISOR_DISABLED'
  | 'NO_OWNER_CONFIGURED'
  | 'NOT_TRADING_DAY'
  | 'CALENDAR_STALE'
  | 'OUTSIDE_SESSION'
  | 'LOCKOUT'
  | 'OPEN_POSITION'
  | 'BELOW_MIN_EQUITY'
  | 'LIVE_LANE_SELECTED';

export interface SupervisorBlocker {
  code: SupervisorBlockerCode;
  message: string;
  /** Whether the admin panel can clear this without human judgement. */
  reconcilable: boolean;
}

export interface SupervisorStatus {
  enabled: boolean;
  etDate: string;
  etTime: string;
  isTradingDay: boolean;
  /** Config: when the supervisor arms and stands down (ET, HH:MM). */
  armAt: string;
  standDownAt: string;
  armedToday: boolean;
  mode: string | null;
  lane: string | null;
  /** Empty means it would arm on the next tick. */
  blockers: SupervisorBlocker[];
}

/**
 * Arms the owner's paper bot for the session and stands it down at the end,
 * unattended. This is the "set it and forget it" piece.
 *
 * Three constraints shape it, all deliberate:
 *
 * **Owner-only, paper-only.** It arms exactly one account's `BOT_PAPER` lane.
 * `BOT_LIVE` stays entirely manual — an unattended process arming real money
 * is a different risk class that deserves its own deliberate work. That is a
 * hard-coded invariant here, not a config flag.
 *
 * **Conservative under uncertainty.** If it finds a state it did not create —
 * yesterday's lockout, a leftover open position, equity under the floor — it
 * refuses to arm and records why. A missed session costs one day; arming from
 * a misread state can lose money. This mirrors the research doc's "default
 * posture under uncertainty is Flatten and Halt".
 *
 * **Refusals are visible.** A background process that silently does nothing
 * is indistinguishable from one that is broken, so every decision is written
 * to `bot_events` and the current blockers are exposed live for the admin
 * panel to render and act on.
 */
@Injectable()
export class BotSupervisorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotSupervisorService.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  /** ET date the supervisor last armed, so it arms once per session. */
  private armedOn: string | null = null;
  /** ET date it last stood down, so stand-down is also once per session. */
  private stoodDownOn: string | null = null;
  /** Last refusal message, to log on change rather than every minute. */
  private lastRefusal: string | null = null;

  constructor(
    private readonly botStateService: BotStateService,
    private readonly botEventService: BotEventService,
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
  ) {}

  onModuleInit(): void {
    if (!this.config.botSupervisorEnabled) {
      this.logger.log(
        'Bot supervisor disabled (BOT_DAILY_SUPERVISOR_ENABLED is not true) — the paper bot will not arm itself',
      );
      return;
    }
    if (!this.config.ownerUserId) {
      this.logger.warn(
        'Bot supervisor enabled but SCHWAB_OWNER_USER_ID is unset — nothing to arm',
      );
      return;
    }
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.logger.log(
      `Bot supervisor enabled — arming ${BotLane.BOT_PAPER} at ${this.config.supervisorArmAt} ET, standing down at ${this.config.supervisorStandDownAt} ET`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Live view for the admin panel.
   *
   * Recomputes blockers rather than replaying the last decision, so the panel
   * always shows what is true *now* — a lockout cleared by hand should
   * disappear from the list immediately, not at the next tick.
   */
  async getStatus(): Promise<SupervisorStatus> {
    const etDate = etDateKey(new Date());
    const etTime = etNowHhMm();
    const ownerUserId = this.config.ownerUserId;

    const base = {
      enabled: this.config.botSupervisorEnabled,
      etDate,
      etTime,
      isTradingDay: isTradingDay(etDate),
      armAt: this.config.supervisorArmAt,
      standDownAt: this.config.supervisorStandDownAt,
      armedToday: this.armedOn === etDate,
    };

    if (!ownerUserId) {
      return {
        ...base,
        mode: null,
        lane: null,
        blockers: [
          {
            code: 'NO_OWNER_CONFIGURED',
            message:
              'SCHWAB_OWNER_USER_ID is not set, so there is no account to arm.',
            reconcilable: false,
          },
        ],
      };
    }

    const row = await runAsUser(ownerUserId, () =>
      this.botStateService.getRow(ownerUserId),
    );
    const status = await runAsUser(ownerUserId, () =>
      this.botStateService.getStatus(),
    );

    return {
      ...base,
      mode: row.mode,
      lane: row.lane,
      blockers: this.computeBlockers(row, status.paperEquity, etDate, etTime),
    };
  }

  private computeBlockers(
    row: {
      mode: BotMode;
      lane: BotLane | null;
      lockout: boolean;
      openPosition: unknown;
    },
    paperEquity: number,
    etDate: string,
    etTime: string,
  ): SupervisorBlocker[] {
    const blockers: SupervisorBlocker[] = [];

    if (!this.config.botSupervisorEnabled) {
      blockers.push({
        code: 'SUPERVISOR_DISABLED',
        message:
          'BOT_DAILY_SUPERVISOR_ENABLED is not true on this app. Exactly one app should run the supervisor.',
        reconcilable: false,
      });
    }

    if (isWeekend(etDate)) {
      blockers.push({
        code: 'NOT_TRADING_DAY',
        message: 'Weekend — the market is closed.',
        reconcilable: false,
      });
    } else if (isMarketHoliday(etDate)) {
      blockers.push({
        code: 'NOT_TRADING_DAY',
        message: 'Market holiday.',
        reconcilable: false,
      });
    }

    if (isBeyondCalendarCoverage(etDate)) {
      blockers.push({
        code: 'CALENDAR_STALE',
        message:
          'The trading-holiday list does not cover this year yet, so holidays may be treated as trading days. Extend trading-calendar.util.ts.',
        reconcilable: false,
      });
    }

    if (!isAtOrPast(etTime, this.config.supervisorArmAt)) {
      blockers.push({
        code: 'OUTSIDE_SESSION',
        message: `Before the ${this.config.supervisorArmAt} ET arm time.`,
        reconcilable: false,
      });
    } else if (isAtOrPast(etTime, this.config.supervisorStandDownAt)) {
      blockers.push({
        code: 'OUTSIDE_SESSION',
        message: `Past the ${this.config.supervisorStandDownAt} ET stand-down time.`,
        reconcilable: false,
      });
    }

    // State the supervisor did not create. These are the ones worth a
    // reconcile button: each is safe for a human to clear deliberately, and
    // unsafe for a background process to assume away.
    if (row.lockout) {
      blockers.push({
        code: 'LOCKOUT',
        message:
          'The bot is locked out — most likely a loss limit or kill switch from a previous session.',
        reconcilable: true,
      });
    }

    if (row.openPosition) {
      blockers.push({
        code: 'OPEN_POSITION',
        message:
          'A position was left open. The supervisor will not arm on top of state it did not create.',
        reconcilable: true,
      });
    }

    if (paperEquity < MIN_EQUITY) {
      blockers.push({
        code: 'BELOW_MIN_EQUITY',
        message: `Paper equity is under the $${MIN_EQUITY.toLocaleString()} floor.`,
        reconcilable: true,
      });
    }

    if (row.lane === BotLane.BOT_LIVE) {
      blockers.push({
        code: 'LIVE_LANE_SELECTED',
        message:
          'The live lane is selected. The supervisor only ever arms paper; switch to paper or arm live yourself.',
        reconcilable: false,
      });
    }

    return blockers;
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const ownerUserId = this.config.ownerUserId;
      if (!ownerUserId) return;

      const etDate = etDateKey(new Date());
      const etTime = etNowHhMm();
      if (!isTradingDay(etDate)) return;

      await runAsUser(ownerUserId, () =>
        this.evaluate(ownerUserId, etDate, etTime),
      );
    } catch (err) {
      this.logger.warn(`supervisor tick failed: ${(err as Error).message}`);
    } finally {
      this.ticking = false;
    }
  }

  private async evaluate(
    ownerUserId: string,
    etDate: string,
    etTime: string,
  ): Promise<void> {
    // Stand down first: at the end of the session this is the only action
    // that should happen, regardless of arm state.
    if (isAtOrPast(etTime, this.config.supervisorStandDownAt)) {
      await this.standDown(etDate);
      return;
    }

    if (!isAtOrPast(etTime, this.config.supervisorArmAt)) return;
    if (this.armedOn === etDate) return;

    const row = await this.botStateService.getRow(ownerUserId);
    const status = await this.botStateService.getStatus();

    // Already running in paper — nothing to do, and record the day as armed
    // so a manual start is not re-armed or logged every minute.
    if (row.mode === BotMode.BOT && row.lane === BotLane.BOT_PAPER) {
      this.armedOn = etDate;
      return;
    }

    const blockers = this.computeBlockers(
      row,
      status.paperEquity,
      etDate,
      etTime,
    ).filter((blocker) => blocker.code !== 'OUTSIDE_SESSION');

    if (blockers.length) {
      await this.recordRefusal(blockers);
      return;
    }

    await this.botStateService.setLane(BotLane.BOT_PAPER);
    await this.botStateService.setMode(BotMode.BOT);
    this.armedOn = etDate;
    this.stoodDownOn = null;
    this.lastRefusal = null;

    await this.botEventService.record({
      lane: BotLane.BOT_PAPER,
      type: BotEventType.SUPERVISOR_ARM,
      reason: `Armed for the ${etDate} session at ${etTime} ET`,
    });
    this.logger.log(`Supervisor armed BOT_PAPER for ${etDate} at ${etTime} ET`);
  }

  private async standDown(etDate: string): Promise<void> {
    if (this.stoodDownOn === etDate) return;

    const row = await this.botStateService.getRow();
    if (row.mode !== BotMode.BOT) {
      this.stoodDownOn = etDate;
      return;
    }

    // KillScope.ALL flattens and halts. The engine's own hardFlattenTime
    // normally closes the position first; this is the backstop for a day
    // where that did not happen.
    await this.botStateService.kill(KillScope.ALL);
    this.stoodDownOn = etDate;
    this.armedOn = null;

    await this.botEventService.record({
      lane: row.lane,
      type: BotEventType.SUPERVISOR_STANDDOWN,
      reason: `Stood down at ${this.config.supervisorStandDownAt} ET for ${etDate}`,
    });
    this.logger.log(`Supervisor stood the bot down for ${etDate}`);
  }

  private async recordRefusal(blockers: SupervisorBlocker[]): Promise<void> {
    const summary = blockers.map((b) => b.code).join(', ');
    // Once per distinct reason, not once per minute for six hours.
    if (this.lastRefusal === summary) return;
    this.lastRefusal = summary;

    await this.botEventService.record({
      lane: BotLane.BOT_PAPER,
      type: BotEventType.SUPERVISOR_REFUSED,
      reason: blockers.map((b) => b.message).join(' '),
      payload: { blockers },
    });
    this.logger.warn(`Supervisor refused to arm: ${summary}`);
  }

  /**
   * Clears the state a refusal is waiting on, then lets the next tick arm.
   *
   * Operator-initiated only — this is the deliberate human judgement the
   * unattended path refuses to make on its own. Flattens any leftover
   * position, clears a stale lockout, and tops the paper ledger back up if it
   * fell through the floor.
   */
  async reconcile(): Promise<SupervisorStatus> {
    const ownerUserId = this.config.ownerUserId;
    if (!ownerUserId) return this.getStatus();

    await runAsUser(ownerUserId, async () => {
      const row = await this.botStateService.getRow(ownerUserId);
      const status = await this.botStateService.getStatus();

      if (row.openPosition) {
        await this.botStateService.kill(KillScope.ALL);
      }
      // Re-read: kill() sets a lockout of its own, so clearing has to follow.
      const afterKill = await this.botStateService.getRow(ownerUserId);
      if (afterKill.lockout) {
        await this.botStateService.unlock();
      }
      if (status.paperEquity < MIN_EQUITY) {
        await this.botStateService.resetPaper();
      }
    });

    // Let the next tick arm on its own rather than forcing it here, so the
    // normal blocker checks still apply.
    this.lastRefusal = null;
    this.armedOn = null;
    return this.getStatus();
  }

  /** Arms now, skipping the arm-time check but not the safety blockers. */
  async armNow(): Promise<SupervisorStatus> {
    const ownerUserId = this.config.ownerUserId;
    if (!ownerUserId) return this.getStatus();

    const etDate = etDateKey(new Date());
    await runAsUser(ownerUserId, async () => {
      const row = await this.botStateService.getRow(ownerUserId);
      const status = await this.botStateService.getStatus();
      const blockers = this.computeBlockers(
        row,
        status.paperEquity,
        etDate,
        etNowHhMm(),
      ).filter(
        (blocker) =>
          blocker.code !== 'OUTSIDE_SESSION' &&
          blocker.code !== 'SUPERVISOR_DISABLED',
      );
      if (blockers.length) {
        // Surfaced through getStatus() below rather than thrown, so the panel
        // renders the same blocker list it was already showing.
        return;
      }
      await this.botStateService.setLane(BotLane.BOT_PAPER);
      await this.botStateService.setMode(BotMode.BOT);
      this.armedOn = etDate;
      await this.botEventService.record({
        lane: BotLane.BOT_PAPER,
        type: BotEventType.SUPERVISOR_ARM,
        reason: `Armed manually from the admin panel at ${etNowHhMm()} ET`,
      });
    });

    return this.getStatus();
  }

  /** Stands the bot down now — flatten and halt. */
  async standDownNow(): Promise<SupervisorStatus> {
    const ownerUserId = this.config.ownerUserId;
    if (!ownerUserId) return this.getStatus();

    await runAsUser(ownerUserId, async () => {
      const row = await this.botStateService.getRow(ownerUserId);
      if (row.mode === BotMode.BOT) {
        await this.botStateService.kill(KillScope.ALL);
      }
    });
    this.armedOn = null;
    this.stoodDownOn = etDateKey(new Date());
    return this.getStatus();
  }
}
