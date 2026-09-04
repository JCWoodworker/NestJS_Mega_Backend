import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { MarketDataService } from '@schwab/market-data/market-data.service';
import { OrdersService } from '@schwab/orders/orders.service';
import { etDateKey } from '@schwab/pnl/et-date.util';
import {
  OptionsGateway,
  ChartCandlePayload,
  UnderlyingPricePayload,
} from '@schwab/streaming/options.gateway';
import { SchwabStreamerService } from '@schwab/streaming/schwab-streamer.service';

import { BotEventService } from './bot-event.service';
import { BotExecutionService } from './bot-execution.service';
import { BotMarketDataService } from './bot-market-data.service';
import { BotSettingsService } from './bot-settings.service';
import { BotStateService } from './bot-state.service';
import {
  combineSignals,
  computeAtr,
  computeOrbRange,
  computeVwap,
  etNowHhMm,
  etSessionStartMs,
  evaluateOrb5m,
  evaluateVwapPullback,
  isAtOrPast,
  isDirectionAllowed,
  isWithinWindow,
} from './bot-strategy.util';
import {
  computeBudget,
  selectContract,
  sizePosition,
} from './bot-strike-selection.util';
import { BotEventType, BotPhase } from './enums/bot-event-type.enum';
import { BotLane } from './enums/bot-lane.enum';
import { BotMode } from './enums/bot-mode.enum';
import { KillScope } from './enums/kill-scope.enum';
import { BotDirection, BotStrategy } from './enums/strategy.enum';

const HEARTBEAT_MS = 7_000;
/** "Refuse entry if option/underlying quote older than ~2s" (plan §Strategy loop). */
const QUOTE_FRESHNESS_MS = 2_000;

@Injectable()
export class BotEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotEngineService.name);
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private evaluating = false;
  private lastStatusEmitAt = 0;
  /** ENTERING/EXITING override the state-derived phase while a walk-limit
   * order chase is actively running — see `bot-phase.util.computePhase`. */
  private transientPhase: 'ENTERING' | 'EXITING' | null = null;
  private lastEmittedPhase: BotPhase | null = null;

  constructor(
    @Inject(forwardRef(() => BotStateService))
    private readonly botStateService: BotStateService,
    private readonly botSettingsService: BotSettingsService,
    private readonly botMarketDataService: BotMarketDataService,
    private readonly botExecutionService: BotExecutionService,
    private readonly botEventService: BotEventService,
    private readonly marketDataService: MarketDataService,
    private readonly ordersService: OrdersService,
    private readonly optionsGateway: OptionsGateway,
    private readonly streamerService: SchwabStreamerService,
  ) {}

  getTransientPhase(): 'ENTERING' | 'EXITING' | null {
    return this.transientPhase;
  }

  onModuleInit(): void {
    this.botMarketDataService.startListening();
    this.optionsGateway.on('chart-candle', this.handleChartCandleClose);
    this.optionsGateway.on('underlying-price', this.handleUnderlyingPrice);
    this.heartbeatTimer = setInterval(
      () => void this.heartbeat(),
      HEARTBEAT_MS,
    );
    void this.botMarketDataService.ensureSeeded();
  }

  onModuleDestroy(): void {
    this.optionsGateway.off('chart-candle', this.handleChartCandleClose);
    this.optionsGateway.off('underlying-price', this.handleUnderlyingPrice);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.botMarketDataService.stopListening();
  }

  /** Called by BotStateService after any control-plane mutation. */
  onControlPlaneChange(): void {
    void this.emitStatus(true);
  }

  private handleChartCandleClose = (candle?: ChartCandlePayload): void => {
    // Only SPY equity bars drive entry evaluation (option chart shares the
    // same gateway event and would otherwise double-eval).
    if (candle && candle.assetType !== 'EQUITY') return;
    void this.evaluateEntrySignal(candle?.chartTime);
  };

  private handleUnderlyingPrice = (payload: UnderlyingPricePayload): void => {
    void this.checkSoftStopAndTargets(payload.price);
  };

  private async evaluateEntrySignal(chartTime?: number): Promise<void> {
    if (this.evaluating) return;
    this.evaluating = true;
    try {
      const row = await this.botStateService.getRow();
      if (
        row.mode !== BotMode.BOT ||
        !row.lane ||
        row.lockout ||
        !row.running
      ) {
        await this.botEventService.recordDeduped(
          {
            lane: row.lane,
            type: BotEventType.GATE_SKIP,
            reason: 'NOT_ARMED',
            payload: {
              mode: row.mode,
              lane: row.lane,
              lockout: row.lockout,
              running: row.running,
            },
          },
          chartTime,
        );
        return;
      }
      if (row.openPosition) {
        await this.botEventService.recordDeduped(
          {
            lane: row.lane,
            type: BotEventType.GATE_SKIP,
            reason: 'ALREADY_IN_POSITION',
            symbol: row.openPosition.symbol,
          },
          chartTime,
        );
        return;
      }

      const settings = await this.botSettingsService.getSettings();
      const nowHhMm = etNowHhMm();
      if (
        !isWithinWindow(
          nowHhMm,
          settings.tradeWindowStart,
          settings.tradeWindowEnd,
        )
      ) {
        await this.botEventService.recordDeduped(
          {
            lane: row.lane,
            type: BotEventType.GATE_SKIP,
            reason: 'OUTSIDE_WINDOW',
            payload: {
              nowHhMm,
              start: settings.tradeWindowStart,
              end: settings.tradeWindowEnd,
            },
          },
          chartTime,
        );
        return;
      }
      if (
        row.lastTradeAt &&
        Date.now() - row.lastTradeAt.getTime() < settings.cooldownMins * 60_000
      ) {
        await this.botEventService.recordDeduped(
          {
            lane: row.lane,
            type: BotEventType.GATE_SKIP,
            reason: 'COOLDOWN',
            payload: {
              cooldownMins: settings.cooldownMins,
              lastTradeAt: row.lastTradeAt.toISOString(),
            },
          },
          chartTime,
        );
        return;
      }

      const status = await this.botStateService.getStatus();
      if (!status.minEquityOk) {
        await this.botEventService.recordDeduped(
          {
            lane: row.lane,
            type: BotEventType.GATE_SKIP,
            reason: 'MIN_EQUITY',
            payload: { equity: status.equity },
          },
          chartTime,
        );
        return;
      }

      const lastFrameAt = this.streamerService.getLastFrameAt();
      if (
        !this.streamerService.isStreamConnected() ||
        lastFrameAt == null ||
        Date.now() - lastFrameAt > QUOTE_FRESHNESS_MS
      ) {
        await this.botEventService.recordDeduped(
          {
            lane: row.lane,
            type: BotEventType.GATE_SKIP,
            reason: 'STALE_QUOTE',
            payload: {
              connected: this.streamerService.isStreamConnected(),
              lastFrameAt,
            },
          },
          chartTime,
        );
        return;
      }

      const candles = this.botMarketDataService.getCandles();
      if (candles.length < 6) {
        await this.botEventService.recordDeduped(
          {
            lane: row.lane,
            type: BotEventType.GATE_SKIP,
            reason: 'INSUFFICIENT_CANDLES',
            payload: { candleCount: candles.length },
          },
          chartTime,
        );
        return;
      }
      const sessionStart = etSessionStartMs();
      const vwap = computeVwap(candles, sessionStart);
      const atr = computeAtr(candles, settings.atrPeriod);
      const orb = computeOrbRange(candles, sessionStart);

      const results: Partial<
        Record<'VWAP_PULLBACK' | 'ORB_5M', 'CALL' | 'PUT' | null>
      > = {};
      if (settings.strategiesEnabled.includes(BotStrategy.VWAP_PULLBACK)) {
        results.VWAP_PULLBACK = evaluateVwapPullback(candles, vwap, atr);
      }
      if (settings.strategiesEnabled.includes(BotStrategy.ORB_5M)) {
        results.ORB_5M = evaluateOrb5m(candles, orb);
      }

      const enabledKeys = settings.strategiesEnabled.map(
        (s) => s as 'VWAP_PULLBACK' | 'ORB_5M',
      );
      const combined = combineSignals(enabledKeys, results);
      if (!combined) {
        await this.botEventService.recordDeduped(
          {
            lane: row.lane,
            type: BotEventType.NO_SIGNAL,
            reason: 'CONFIRMING_NO_AGREEMENT',
            strategies: enabledKeys,
            payload: {
              results,
              vwap,
              atr,
              orb,
              directionsEnabled: settings.directionsEnabled,
            },
          },
          chartTime ?? candles[candles.length - 1]?.chartTime,
        );
        return;
      }

      await this.botEventService.record({
        lane: row.lane,
        type: BotEventType.SIGNAL,
        direction: combined.direction as BotDirection,
        strategies: combined.strategies,
        reason: combined.reason,
      });

      await this.executeEntry(combined.direction, combined, settings, status);
    } catch (err) {
      this.logger.warn(`evaluateEntrySignal failed: ${err.message}`);
      await this.recordError(err.message);
      try {
        const row = await this.botStateService.getRow();
        await this.botEventService.record({
          lane: row.lane,
          type: BotEventType.ERROR,
          reason: err.message,
        });
      } catch {
        /* ignore secondary failure */
      }
    } finally {
      this.evaluating = false;
    }
  }

  private async executeEntry(
    direction: 'CALL' | 'PUT',
    signal: { at: number; strategies: string[]; reason: string },
    settings: Awaited<ReturnType<BotSettingsService['getSettings']>>,
    status: Awaited<ReturnType<BotStateService['getStatus']>>,
  ): Promise<void> {
    const accountHash = await this.botStateService.resolveAccountHash();
    const row = await this.botStateService.getRow();
    if (!row.lane) return;

    // Preference ∩ capability — skip before any chain lookup or order work.
    if (!isDirectionAllowed(direction, settings)) {
      await this.botEventService.record({
        lane: row.lane,
        type: BotEventType.SKIP,
        direction: direction as BotDirection,
        reason: 'DIRECTION_DISABLED',
      });
      return;
    }

    if (
      row.lane === BotLane.BOT_LIVE &&
      (await this.botExecutionService.hasBotWorkingOrder(accountHash))
    ) {
      await this.botEventService.record({
        lane: row.lane,
        type: BotEventType.SKIP,
        direction: direction as BotDirection,
        reason: 'BOT_ORDER_ALREADY_WORKING',
      });
      return;
    }

    const chain = await this.marketDataService.getOptionChain({
      symbol: 'SPY',
      strikeCount: 16,
    });
    const contract = selectContract(chain, direction, {
      deltaMin: settings.deltaMin,
      deltaMax: settings.deltaMax,
      minPremium: settings.minPremium,
      maxPremium: settings.maxPremium,
      maxSpreadPct: settings.maxSpreadPct,
    });
    if (!contract || contract.ask == null || contract.bid == null) {
      await this.botEventService.record({
        lane: row.lane,
        type: BotEventType.SKIP,
        direction: direction as BotDirection,
        reason: 'NO_CONTRACT_MATCH',
      });
      return;
    }

    const budget = computeBudget(
      status.settledCash,
      status.equity,
      settings.riskPct,
    );
    const qty = sizePosition(budget, contract.ask);
    if (qty < 1) {
      row.lastSignal = {
        at: signal.at,
        strategies: signal.strategies as BotStrategy[],
        direction: direction as BotDirection,
        reason: `${signal.reason} (SKIP_BUDGET)`,
      };
      await this.botStateService.save(row);
      await this.botEventService.record({
        lane: row.lane,
        type: BotEventType.SKIP,
        direction: direction as BotDirection,
        symbol: contract.symbol,
        reason: 'SKIP_BUDGET',
      });
      await this.emitStatus(true);
      return;
    }

    const spot = this.streamerService.getLastKnownSpotPrice();
    const stopUnderlying =
      spot != null ? (direction === 'CALL' ? spot - 2 : spot + 2) : null;
    const targetUnderlying =
      spot != null ? (direction === 'CALL' ? spot + 3 : spot - 3) : null;

    await this.botEventService.record({
      lane: row.lane,
      type: BotEventType.ENTRY_SUBMIT,
      direction: direction as BotDirection,
      symbol: contract.symbol,
      quantity: qty,
      underlyingPrice: spot ?? undefined,
    });

    this.transientPhase = 'ENTERING';
    let result: Awaited<ReturnType<BotExecutionService['enter']>>;
    try {
      result = await this.botExecutionService.enter({
        accountHash,
        lane: row.lane,
        symbol: contract.symbol,
        quantity: qty,
        referenceAsk: contract.ask,
        referenceBid: contract.bid,
        paperSlippageCents: settings.paperSlippageCents,
        stopUnderlying,
        targetUnderlying,
      });
    } finally {
      this.transientPhase = null;
    }
    if (!result.filled) {
      await this.botEventService.record({
        lane: row.lane,
        type: BotEventType.SKIP,
        direction: direction as BotDirection,
        symbol: contract.symbol,
        orderId: result.orderId ?? undefined,
        reason: 'ENTRY_ABANDONED',
      });
      return;
    }

    row.openPosition = {
      symbol: contract.symbol,
      quantity: qty,
      entryPrice: result.fillPrice,
      stopUnderlying,
      targetUnderlying,
      source: row.lane,
    };
    row.lastSignal = {
      at: signal.at,
      strategies: signal.strategies as BotStrategy[],
      direction: direction as BotDirection,
      reason: signal.reason,
    };
    row.lastTradeAt = new Date();
    if (row.lane === BotLane.BOT_PAPER) {
      row.paperSettledCash =
        Number(row.paperSettledCash) - result.fillPrice * qty * 100;
    }
    await this.botStateService.save(row);
    await this.botEventService.record({
      lane: row.lane,
      type: BotEventType.ENTRY_FILL,
      direction: direction as BotDirection,
      side: 'BUY',
      symbol: contract.symbol,
      quantity: qty,
      fillPrice: result.fillPrice,
      underlyingPrice: spot ?? undefined,
      orderId: result.orderId ?? undefined,
    });
    await this.emitStatus(true);
  }

  private async checkSoftStopAndTargets(spot: number): Promise<void> {
    try {
      const row = await this.botStateService.getRow();
      if (!row.openPosition || !row.lane) return;
      const { stopUnderlying, targetUnderlying } = row.openPosition;
      const direction = row.lastSignal?.direction;

      let triggered = false;
      if (direction === BotDirection.CALL) {
        if (stopUnderlying != null && spot <= stopUnderlying) triggered = true;
        if (targetUnderlying != null && spot >= targetUnderlying)
          triggered = true;
      } else if (direction === BotDirection.PUT) {
        if (stopUnderlying != null && spot >= stopUnderlying) triggered = true;
        if (targetUnderlying != null && spot <= targetUnderlying)
          triggered = true;
      }
      if (!triggered) return;

      await this.closeOpenPosition('SOFT_STOP_OR_TARGET');
    } catch (err) {
      this.logger.warn(`checkSoftStopAndTargets failed: ${err.message}`);
    }
  }

  private async closeOpenPosition(reasonTag: string): Promise<void> {
    const row = await this.botStateService.getRow();
    if (!row.openPosition || !row.lane) return;
    const accountHash = await this.botStateService.resolveAccountHash();
    const direction = row.lastSignal?.direction;
    const spot = this.streamerService.getLastKnownSpotPrice();

    const chain = await this.marketDataService.getOptionChain({
      symbol: 'SPY',
      symbols: row.openPosition.symbol,
    });
    const quote = chain.find((q) => q.symbol === row.openPosition!.symbol);
    const settings = await this.botSettingsService.getSettings();

    await this.botEventService.record({
      lane: row.lane,
      type: BotEventType.EXIT_SUBMIT,
      direction,
      symbol: row.openPosition.symbol,
      quantity: row.openPosition.quantity,
      underlyingPrice: spot ?? undefined,
      reason: reasonTag,
    });

    this.transientPhase = 'EXITING';
    let result: Awaited<ReturnType<BotExecutionService['exit']>>;
    try {
      result = await this.botExecutionService.exit({
        accountHash,
        lane: row.lane,
        symbol: row.openPosition.symbol,
        quantity: row.openPosition.quantity,
        referenceBid: quote?.bid ?? row.openPosition.entryPrice,
        referenceAsk: quote?.ask ?? row.openPosition.entryPrice,
        paperSlippageCents: settings.paperSlippageCents,
      });
    } finally {
      this.transientPhase = null;
    }

    if (result.filled && row.lane === BotLane.BOT_PAPER) {
      row.paperSettledCash =
        Number(row.paperSettledCash) +
        result.fillPrice * row.openPosition.quantity * 100;
      row.paperEquity = row.paperSettledCash;
    }

    this.logger.log(
      `Closed bot position ${row.openPosition.symbol} (${reasonTag})`,
    );
    const closedPosition = row.openPosition;
    row.openPosition = null;
    await this.botStateService.save(row);
    await this.botEventService.record({
      lane: row.lane,
      type: BotEventType.EXIT_FILL,
      direction,
      side: 'SELL',
      symbol: closedPosition.symbol,
      quantity: closedPosition.quantity,
      fillPrice: result.fillPrice,
      underlyingPrice: spot ?? undefined,
      orderId: result.orderId ?? undefined,
      reason: reasonTag,
    });
    await this.emitStatus(true);
  }

  /** Shared safety path: kill switch, max-loss, profit-target, recon mismatch,
   * socket loss, and live/disable all route through here. */
  async flattenAndHalt(
    reason: string,
    scope: KillScope = KillScope.ALL,
  ): Promise<void> {
    const row = await this.botStateService.getRow();
    const affectsLane =
      scope === KillScope.ALL ||
      (scope === KillScope.PAPER && row.lane === BotLane.BOT_PAPER) ||
      (scope === KillScope.LIVE && row.lane === BotLane.BOT_LIVE);

    if (affectsLane) {
      if (row.lane === BotLane.BOT_LIVE) {
        try {
          const accountHash = await this.botStateService.resolveAccountHash();
          await this.botExecutionService.cancelBotWorkingOrders(accountHash);
        } catch (err) {
          this.logger.warn(
            `Failed to cancel bot working orders: ${err.message}`,
          );
        }
      }
      if (row.openPosition) {
        try {
          await this.closeOpenPosition(reason);
        } catch (err) {
          this.logger.warn(`Failed to flatten bot position: ${err.message}`);
        }
      }
    }

    const refreshed = await this.botStateService.getRow();
    refreshed.lockout = true;
    refreshed.lockoutReason = reason;
    refreshed.lockoutDateKey = etDateKey();
    refreshed.running = false;
    await this.botStateService.save(refreshed);
    await this.botEventService.record({
      lane: refreshed.lane,
      type:
        reason === 'KILL_SWITCH'
          ? BotEventType.FLAT_KILL
          : BotEventType.LOCKOUT,
      reason,
    });
    await this.emitStatus(true);
    this.logger.warn(`Bot flattened and halted: ${reason} (scope=${scope})`);
  }

  private async heartbeat(): Promise<void> {
    try {
      await this.botStateService.refreshLiveBalances();
      await this.botStateService.clearLockoutIfNewDay();
      const row = await this.botStateService.getRow();
      if (row.mode !== BotMode.BOT || !row.lane || row.lockout) {
        await this.emitStatus(false);
        return;
      }

      const settings = await this.botSettingsService.getSettings();
      const nowHhMm = etNowHhMm();

      if (isAtOrPast(nowHhMm, settings.hardFlattenTime)) {
        if (row.openPosition) {
          await this.flattenAndHalt('HARD_FLATTEN_EOD', KillScope.ALL);
        }
        return;
      }

      await this.checkLossAndProfitGates(row, settings);

      if (row.lane === BotLane.BOT_LIVE) {
        await this.reconcileLivePosition(row);
      }

      if (!this.streamerService.isStreamConnected() && row.openPosition) {
        await this.flattenAndHalt('SOCKET_LOSS', KillScope.ALL);
        return;
      }

      await this.emitStatus(false);
    } catch (err) {
      this.logger.warn(`heartbeat failed: ${err.message}`);
    }
  }

  private async checkLossAndProfitGates(
    row: Awaited<ReturnType<BotStateService['getRow']>>,
    settings: Awaited<ReturnType<BotSettingsService['getSettings']>>,
  ): Promise<void> {
    const status = await this.botStateService.getStatus();
    const dayStart =
      row.lane === BotLane.BOT_PAPER
        ? Number(row.paperDayStartEquity)
        : this.botStateService.getLiveBalances().dayStartEquity;
    const pnl = status.todayBotPnl;

    if (
      settings.useMaxLossUsd &&
      settings.maxLossUsd != null &&
      pnl <= -settings.maxLossUsd
    ) {
      await this.flattenAndHalt('MAX_LOSS_USD', KillScope.ALL);
      return;
    }
    if (
      settings.useMaxLossPct &&
      settings.maxLossPct != null &&
      dayStart > 0 &&
      pnl <= -(dayStart * (settings.maxLossPct / 100))
    ) {
      await this.flattenAndHalt('MAX_LOSS_PCT', KillScope.ALL);
      return;
    }

    if (
      settings.useProfitUsd &&
      settings.profitUsd != null &&
      pnl >= settings.profitUsd
    ) {
      await this.flattenAndHalt('PROFIT_TARGET_USD', KillScope.ALL);
      return;
    }
    if (
      settings.useProfitPctDayStart &&
      settings.profitPctDayStart != null &&
      dayStart > 0 &&
      pnl >= dayStart * (settings.profitPctDayStart / 100)
    ) {
      await this.flattenAndHalt('PROFIT_TARGET_PCT_DAY_START', KillScope.ALL);
      return;
    }
    if (
      settings.useProfitPctCurrent &&
      settings.profitPctCurrent != null &&
      status.equity > 0 &&
      pnl >= status.equity * (settings.profitPctCurrent / 100)
    ) {
      await this.flattenAndHalt('PROFIT_TARGET_PCT_CURRENT', KillScope.ALL);
    }
  }

  private async reconcileLivePosition(
    row: Awaited<ReturnType<BotStateService['getRow']>>,
  ): Promise<void> {
    if (!row.openPosition) return;
    try {
      const accountHash = await this.botStateService.resolveAccountHash();
      const positions = await this.ordersService.getPositions(accountHash);
      const match = positions.find(
        (p: any) => p.symbol === row.openPosition!.symbol,
      );
      if (!match || Number(match.quantity ?? 0) < row.openPosition.quantity) {
        await this.flattenAndHalt('RECON_MISMATCH', KillScope.ALL);
      }
    } catch (err) {
      this.logger.warn(`reconcileLivePosition failed: ${err.message}`);
    }
  }

  private async recordError(message: string): Promise<void> {
    const row = await this.botStateService.getRow();
    row.lastError = message;
    await this.botStateService.save(row);
  }

  private async emitStatus(force: boolean): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastStatusEmitAt < 1000) return;
    this.lastStatusEmitAt = now;
    const status = await this.botStateService.getStatus();

    if (
      this.lastEmittedPhase !== null &&
      status.phase !== this.lastEmittedPhase
    ) {
      await this.botEventService.record({
        lane: status.lane,
        type: BotEventType.PHASE,
        reason: `${this.lastEmittedPhase} → ${status.phase}`,
      });
    }
    this.lastEmittedPhase = status.phase;

    this.optionsGateway.emitBotStatus(status);
  }
}
