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

import { BotEngineService } from './bot-engine.service';
import {
  BotLastSignal,
  BotOpenPosition,
  BotState,
} from './entities/bot-state.entity';
import { BotLane } from './enums/bot-lane.enum';
import { BotMode } from './enums/bot-mode.enum';
import { KillScope } from './enums/kill-scope.enum';

export interface BotStatusView {
  mode: BotMode;
  lane: BotLane | null;
  running: boolean;
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
}

const MIN_EQUITY = 100;

@Injectable()
export class BotStateService {
  private readonly logger = new Logger(BotStateService.name);
  private cachedAccountHash: string | null = null;
  private liveEquity = 0;
  private liveSettledCash = 0;
  private liveDayStartEquity = 0;

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
    return this.stateRepository.save(
      this.stateRepository.create({
        mode: BotMode.MANUAL,
        lane: null,
        running: false,
        lockout: false,
        lockoutReason: null,
        liveArmed: false,
      }),
    );
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
    const { todayBotPnl, tradesToday } = await this.todayStats(row.lane);

    return {
      mode: row.mode,
      lane: row.lane,
      running: row.running,
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
    };
  }

  async setMode(mode: BotMode): Promise<BotStatusView> {
    const row = await this.getRow();
    row.mode = mode;
    if (mode === BotMode.MANUAL) {
      row.running = false;
    } else if (mode === BotMode.BOT && row.lane && !row.lockout) {
      row.running = true;
    } else {
      row.running = false;
    }
    await this.save(row);
    this.botEngine.onControlPlaneChange();
    return this.getStatus();
  }

  async setLane(lane: BotLane, confirmLive?: boolean): Promise<BotStatusView> {
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

    row.lane = lane;
    if (row.mode === BotMode.BOT && !row.lockout) {
      row.running = true;
    }
    await this.save(row);
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
    this.botEngine.onControlPlaneChange();
    return this.getStatus();
  }

  async kill(scope: KillScope): Promise<BotStatusView> {
    await this.botEngine.flattenAndHalt('KILL_SWITCH', scope);
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
