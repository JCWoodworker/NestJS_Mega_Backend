import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import schwabConfig from '@schwab/config/schwab.config';
import { MarketDataService } from '@schwab/market-data/market-data.service';
import { OrdersService } from '@schwab/orders/orders.service';
import { etDateKey } from '@schwab/pnl/et-date.util';
import { requireUserId, runAsUser } from '@schwab/shared/schwab-user-context';
import {
  OptionsGateway,
  ChartCandlePayload,
  UnderlyingPricePayload,
} from '@schwab/streaming/options.gateway';
import { SchwabStreamerPool } from '@schwab/streaming/schwab-streamer-pool.service';
import { SchwabStreamerSession } from '@schwab/streaming/schwab-streamer-session';

import { BotEventService } from './bot-event.service';
import { BotExecutionService } from './bot-execution.service';
import {
  computeExitLevels,
  decideSoftExit,
  shouldForceFlattenForSocketLoss,
} from './bot-exit.util';
import { commissionForLeg } from './bot-fees.const';
import { BotMarketDataService } from './bot-market-data.service';
import { BotRecordingService, configVersionOf } from './bot-recording.service';
import { BotSettingsService } from './bot-settings.service';
import { BotStateService } from './bot-state.service';
import { diffStreamerHolds } from './bot-streamer-hold.util';
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
  selectContractDetailed,
  sizePosition,
} from './bot-strike-selection.util';
import { BotEventType, BotPhase } from './enums/bot-event-type.enum';
import { BotLane } from './enums/bot-lane.enum';
import { BotMode } from './enums/bot-mode.enum';
import { KillScope } from './enums/kill-scope.enum';
import {
  BotCombineMode,
  BotDirection,
  BotStrategy,
} from './enums/strategy.enum';

const HEARTBEAT_MS = 7_000;
/** "Refuse entry if option/underlying quote older than ~2s" (plan §Strategy loop). */
const QUOTE_FRESHNESS_MS = 2_000;
/** Prefer stream marks; REST chain only as fallback when stream quote is stale. */
const PREMIUM_STREAM_MAX_AGE_MS = 2_000;
const PREMIUM_REST_FALLBACK_MIN_MS = 3_000;
/**
 * How long the stream must be continuously down before an open position gets
 * force-flattened for it.
 *
 * The streamer reconnects on its own within ~2s for a routine blip, so
 * reacting to the first heartbeat tick that sees `loggedIn === false` treats
 * an ordinary reconnect as an emergency — realizing a loss at whatever price
 * is available to exit a position that would have been fine ten seconds
 * later. This is intentionally still well short of the bot's own quote
 * freshness gates: an outage that outlasts it is no longer "the stream blipped".
 */
const SOCKET_LOSS_GRACE_MS = 15_000;

@Injectable()
export class BotEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotEngineService.name);
  private heartbeatTimer: NodeJS.Timeout | null = null;

  /**
   * Users this engine currently holds a background streamer session for,
   * independent of any browser tab — see `reconcileStreamerHolds`.
   */
  private readonly botHeldUserIds = new Set<string>();

  /**
   * Per-user engine state.
   *
   * One scheduler drives every user's bot, so all of this has to be keyed by
   * tenant. As plain scalars they were cross-talk waiting to happen: a
   * shared `evaluating` flag would let one user's in-flight evaluation
   * silently skip everyone else's entry signals, and a shared
   * `transientPhase` would report one user's order chase on another user's
   * status panel.
   */
  private readonly state = new Map<
    string,
    {
      evaluating: boolean;
      lastStatusEmitAt: number;
      /** ENTERING/EXITING override the state-derived phase while a walk-limit
       * order chase is actively running — see `bot-phase.util.computePhase`. */
      transientPhase: 'ENTERING' | 'EXITING' | null;
      lastEmittedPhase: BotPhase | null;
      lastPremiumQuoteAt: number;
      /** Epoch ms the soft-exit loop last obtained an option bid. Null means
       * the premium stop/target is armed but not being evaluated. */
      lastPremiumBidAt: number | null;
      softExitChecking: boolean;
    }
  >();

  private stateFor(userId: string = requireUserId()) {
    const existing = this.state.get(userId);
    if (existing) return existing;
    const fresh = {
      evaluating: false,
      lastStatusEmitAt: 0,
      transientPhase: null,
      lastEmittedPhase: null,
      lastPremiumQuoteAt: 0,
      lastPremiumBidAt: null,
      softExitChecking: false,
    };
    this.state.set(userId, fresh);
    return fresh;
  }

  constructor(
    @Inject(forwardRef(() => BotStateService))
    private readonly botStateService: BotStateService,
    private readonly botSettingsService: BotSettingsService,
    private readonly botMarketDataService: BotMarketDataService,
    private readonly botExecutionService: BotExecutionService,
    private readonly botEventService: BotEventService,
    private readonly botRecordingService: BotRecordingService,
    private readonly marketDataService: MarketDataService,
    private readonly ordersService: OrdersService,
    private readonly optionsGateway: OptionsGateway,
    private readonly streamerPool: SchwabStreamerPool,
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
  ) {}

  /**
   * The streamer session whose market data drives this user's bot.
   *
   * Still a passive `peek()` — this getter never starts a session itself.
   * While the bot is armed, `reconcileStreamerHolds` keeps one open via its
   * own `'bot'` hold, so this resolves regardless of whether a browser tab
   * is connected. Returns null when truly no session exists (arming hasn't
   * reconciled yet, the pool was at capacity, or a real Schwab outage), which
   * the staleness gates below treat as "no fresh data" and refuse to trade
   * on — the correct default, since an unattended bot must not act on quotes
   * it cannot confirm are current.
   */
  private get streamerSession(): SchwabStreamerSession | null {
    return this.streamerPool.peek(requireUserId());
  }

  getTransientPhase(userId?: string): 'ENTERING' | 'EXITING' | null {
    return this.stateFor(userId).transientPhase;
  }

  /** Epoch ms of the last option bid the soft-exit loop managed to read, or
   * null if it has not read one for the current position. `getStatus` turns
   * this into `premiumWatchOk` so the desk can show when a premium stop is
   * armed but not actually being evaluated. */
  getLastPremiumBidAt(userId?: string): number | null {
    return this.stateFor(userId).lastPremiumBidAt;
  }

  onModuleInit(): void {
    this.botMarketDataService.startListening();
    this.optionsGateway.on('chart-candle', this.handleChartCandleClose);
    this.optionsGateway.on('underlying-price', this.handleUnderlyingPrice);
    this.heartbeatTimer = setInterval(
      () => void this.heartbeatAllUsers(),
      HEARTBEAT_MS,
    );
    // Candle seeding moved into the per-user heartbeat. At module init there
    // is no tenant in scope, and seeding eagerly would also spend a Schwab
    // price-history call for users whose bot is in MANUAL.
  }

  onModuleDestroy(): void {
    this.optionsGateway.off('chart-candle', this.handleChartCandleClose);
    this.optionsGateway.off('underlying-price', this.handleUnderlyingPrice);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.botMarketDataService.stopListening();
    for (const userId of this.botHeldUserIds) {
      this.streamerPool.releaseBackgroundWork(userId);
    }
    this.botHeldUserIds.clear();
  }

  /** Called by BotStateService after any control-plane mutation. */
  onControlPlaneChange(): void {
    void this.emitStatus(true);
  }

  /**
   * Gateway events carry their userId and are dispatched from the streamer's
   * flush timer, which has no ambient tenant. Establishing the context here
   * is what lets everything downstream — candle buffers, bot state, Schwab
   * calls — resolve to the right user. Without it `requireUserId()` throws
   * inside the strategy path.
   */
  private handleChartCandleClose = (
    userId: string,
    candle?: ChartCandlePayload,
  ): void => {
    // Only SPY equity bars drive entry evaluation (option chart shares the
    // same gateway event and would otherwise double-eval).
    if (candle && candle.assetType !== 'EQUITY') return;
    void runAsUser(userId, () => this.evaluateEntrySignal(candle?.chartTime));
  };

  private handleUnderlyingPrice = (
    userId: string,
    payload: UnderlyingPricePayload,
  ): void => {
    void runAsUser(userId, () => this.checkSoftStopAndTargets(payload.price));
  };

  private async evaluateEntrySignal(chartTime?: number): Promise<void> {
    if (this.stateFor().evaluating) return;
    this.stateFor().evaluating = true;
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

      const lastFrameAt = this.streamerSession?.getLastFrameAt() ?? null;
      if (
        !(this.streamerSession?.isStreamConnected() ?? false) ||
        lastFrameAt == null ||
        Date.now() - lastFrameAt > QUOTE_FRESHNESS_MS
      ) {
        await this.botEventService.recordDeduped(
          {
            lane: row.lane,
            type: BotEventType.GATE_SKIP,
            reason: 'STALE_QUOTE',
            payload: {
              connected: this.streamerSession?.isStreamConnected() ?? false,
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
      const combined = combineSignals(
        enabledKeys,
        results,
        chartTime ?? Date.now(),
        settings.combineMode,
      );
      if (!combined) {
        await this.botEventService.recordDeduped(
          {
            lane: row.lane,
            type: BotEventType.NO_SIGNAL,
            reason:
              settings.combineMode === BotCombineMode.ANY
                ? 'ANY_NO_SIGNAL'
                : 'CONFIRMING_NO_AGREEMENT',
            strategies: enabledKeys,
            payload: {
              combineMode: settings.combineMode,
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

      await this.executeEntry(
        combined.direction,
        combined,
        settings,
        status,
        atr,
      );
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
      this.stateFor().evaluating = false;
    }
  }

  private async executeEntry(
    direction: 'CALL' | 'PUT',
    signal: { at: number; strategies: string[]; reason: string },
    settings: Awaited<ReturnType<BotSettingsService['getSettings']>>,
    status: Awaited<ReturnType<BotStateService['getStatus']>>,
    atr: number | null,
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
    const { contract, diagnostics } = selectContractDetailed(chain, direction, {
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
        symbol: contract?.symbol,
        reason: 'NO_CONTRACT_MATCH',
        payload: {
          ...diagnostics,
          filters: {
            deltaMin: settings.deltaMin,
            deltaMax: settings.deltaMax,
            minPremium: settings.minPremium,
            maxPremium: settings.maxPremium,
            maxSpreadPct: settings.maxSpreadPct,
          },
        },
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

    const spot = this.streamerSession?.getLastKnownSpotPrice() ?? null;
    // Provisional levels from ask; recomputed with fill price after entry.
    const provisionalLevels = computeExitLevels({
      entryPremium: contract.ask,
      spot: spot ?? 0,
      atr,
      direction,
      usePremiumStop: settings.usePremiumStop,
      premiumStopPct: settings.premiumStopPct,
      usePremiumTarget: settings.usePremiumTarget,
      premiumTargetPct: settings.premiumTargetPct,
      stopAtrMult: settings.stopAtrMult,
      targetAtrMult: settings.targetAtrMult,
    });
    const stopUnderlying =
      spot != null ? provisionalLevels.stopUnderlying : null;
    const targetUnderlying =
      spot != null ? provisionalLevels.targetUnderlying : null;

    await this.botEventService.record({
      lane: row.lane,
      type: BotEventType.ENTRY_SUBMIT,
      direction: direction as BotDirection,
      symbol: contract.symbol,
      quantity: qty,
      underlyingPrice: spot ?? undefined,
    });

    this.stateFor().transientPhase = 'ENTERING';
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
      this.stateFor().transientPhase = null;
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

    const levels = computeExitLevels({
      entryPremium: result.fillPrice,
      spot: spot ?? 0,
      atr,
      direction,
      usePremiumStop: settings.usePremiumStop,
      premiumStopPct: settings.premiumStopPct,
      usePremiumTarget: settings.usePremiumTarget,
      premiumTargetPct: settings.premiumTargetPct,
      stopAtrMult: settings.stopAtrMult,
      targetAtrMult: settings.targetAtrMult,
    });

    row.openPosition = {
      symbol: contract.symbol,
      quantity: qty,
      entryPrice: result.fillPrice,
      openedAt: Date.now(),
      entryUnderlying: spot ?? null,
      direction: direction as BotDirection,
      atrUsed: levels.atrUsed,
      stopUnderlying: spot != null ? levels.stopUnderlying : null,
      targetUnderlying: spot != null ? levels.targetUnderlying : null,
      stopPremium: levels.stopPremium,
      targetPremium: levels.targetPremium,
      source: row.lane,
    };
    this.stateFor().lastPremiumBidAt = null;
    row.lastSignal = {
      at: signal.at,
      strategies: signal.strategies as BotStrategy[],
      direction: direction as BotDirection,
      reason: signal.reason,
    };
    row.lastTradeAt = new Date();
    if (row.lane === BotLane.BOT_PAPER) {
      // Commission is charged per leg. Without it the paper ledger overstates
      // the edge, and every "should have exited sooner" conclusion inherits
      // that bias — a scalper's margin is thin enough that fees decide it.
      row.paperSettledCash =
        Number(row.paperSettledCash) -
        result.fillPrice * qty * 100 -
        commissionForLeg(qty);
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
      payload: {
        atr: levels.atrUsed,
        stopPremium: levels.stopPremium,
        targetPremium: levels.targetPremium,
        stopUnderlying: row.openPosition.stopUnderlying,
        targetUnderlying: row.openPosition.targetUnderlying,
        premiumStopPct: settings.usePremiumStop
          ? settings.premiumStopPct
          : null,
        premiumTargetPct: settings.usePremiumTarget
          ? settings.premiumTargetPct
          : null,
        stopAtrMult: settings.stopAtrMult,
        targetAtrMult: settings.targetAtrMult,
      },
    });
    await this.emitStatus(true);
  }

  private async checkSoftStopAndTargets(spot: number): Promise<void> {
    if (this.stateFor().softExitChecking || this.stateFor().transientPhase)
      return;
    this.stateFor().softExitChecking = true;
    try {
      const row = await this.botStateService.getRow();
      if (!row.openPosition || !row.lane) return;
      const pos = row.openPosition;
      const direction = pos.direction ?? row.lastSignal?.direction;

      let optionBid: number | null = null;
      const now = Date.now();
      const needsPremium = pos.stopPremium != null || pos.targetPremium != null;
      if (needsPremium) {
        const streamed = this.streamerSession?.getLastOptionQuote(pos.symbol);
        if (
          streamed?.bid != null &&
          now - streamed.at <= PREMIUM_STREAM_MAX_AGE_MS
        ) {
          optionBid = streamed.bid;
        } else if (
          now - this.stateFor().lastPremiumQuoteAt >=
          PREMIUM_REST_FALLBACK_MIN_MS
        ) {
          this.stateFor().lastPremiumQuoteAt = now;
          try {
            const chain = await this.marketDataService.getOptionChain({
              symbol: 'SPY',
              symbols: pos.symbol,
            });
            const quote = chain.find((q) => q.symbol === pos.symbol);
            if (quote?.bid != null) optionBid = Number(quote.bid);
          } catch (err) {
            this.logger.warn(
              `premium quote fetch failed: ${(err as Error).message}`,
            );
          }
        }
      }

      if (optionBid != null) this.stateFor().lastPremiumBidAt = now;

      // The bid was just fetched to evaluate stops — record it before deciding,
      // so the tape captures the path even on the tick that triggers the exit.
      if (pos.openedAt != null) {
        void this.botRecordingService.recordTapeSample({
          symbol: pos.symbol,
          openedAt: pos.openedAt,
          lane: row.lane,
          at: now,
          optionBid,
          optionAsk: null,
          spot,
        });
      }

      const reason = decideSoftExit({
        direction,
        spot,
        optionBid,
        stopPremium: pos.stopPremium ?? null,
        targetPremium: pos.targetPremium ?? null,
        stopUnderlying: pos.stopUnderlying,
        targetUnderlying: pos.targetUnderlying,
      });
      if (!reason) return;

      await this.closeOpenPosition(reason);
    } catch (err) {
      this.logger.warn(`checkSoftStopAndTargets failed: ${err.message}`);
    } finally {
      this.stateFor().softExitChecking = false;
    }
  }

  private async closeOpenPosition(reasonTag: string): Promise<void> {
    const row = await this.botStateService.getRow();
    if (!row.openPosition || !row.lane) return;
    const accountHash = await this.botStateService.resolveAccountHash();
    const direction = row.openPosition.direction ?? row.lastSignal?.direction;
    const spot = this.streamerSession?.getLastKnownSpotPrice() ?? null;

    const streamed = this.streamerSession?.getLastOptionQuote(
      row.openPosition.symbol,
    );
    let quoteBid = streamed?.bid;
    let quoteAsk = streamed?.ask;
    if (quoteBid == null || quoteAsk == null) {
      try {
        const chain = await this.marketDataService.getOptionChain({
          symbol: 'SPY',
          symbols: row.openPosition.symbol,
        });
        const quote = chain.find((q) => q.symbol === row.openPosition!.symbol);
        quoteBid =
          quoteBid ?? (quote?.bid != null ? Number(quote.bid) : undefined);
        quoteAsk =
          quoteAsk ?? (quote?.ask != null ? Number(quote.ask) : undefined);
      } catch {
        /* fall through to entryPrice */
      }
    }
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

    this.stateFor().transientPhase = 'EXITING';
    let result: Awaited<ReturnType<BotExecutionService['exit']>>;
    try {
      result = await this.botExecutionService.exit({
        accountHash,
        lane: row.lane,
        symbol: row.openPosition.symbol,
        quantity: row.openPosition.quantity,
        referenceBid: quoteBid ?? row.openPosition.entryPrice,
        referenceAsk: quoteAsk ?? row.openPosition.entryPrice,
        paperSlippageCents: settings.paperSlippageCents,
      });
    } finally {
      this.stateFor().transientPhase = null;
    }

    if (!result.filled) {
      this.logger.warn(
        `Exit not confirmed filled for ${row.openPosition.symbol} (${reasonTag}) — keeping openPosition`,
      );
      await this.botEventService.record({
        lane: row.lane,
        type: BotEventType.EXIT_SUBMIT,
        direction,
        symbol: row.openPosition.symbol,
        quantity: row.openPosition.quantity,
        underlyingPrice: spot ?? undefined,
        orderId: result.orderId ?? undefined,
        reason: `${reasonTag}_UNFILLED`,
      });
      await this.emitStatus(true);
      return;
    }

    if (result.filled && row.lane === BotLane.BOT_PAPER) {
      row.paperSettledCash =
        Number(row.paperSettledCash) +
        result.fillPrice * row.openPosition.quantity * 100 -
        commissionForLeg(row.openPosition.quantity);
      row.paperEquity = row.paperSettledCash;
    }

    this.logger.log(
      `Closed bot position ${row.openPosition.symbol} (${reasonTag})`,
    );
    const closedPosition = row.openPosition;
    row.openPosition = null;
    this.stateFor().lastPremiumBidAt = null;
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

    if (closedPosition.openedAt != null) {
      await this.botRecordingService.recordTradeClose({
        symbol: closedPosition.symbol,
        openedAt: closedPosition.openedAt,
        closedAt: Date.now(),
        lane: closedPosition.source,
        direction: direction ?? null,
        quantity: closedPosition.quantity,
        entryPrice: closedPosition.entryPrice,
        exitPrice: result.fillPrice,
        entryUnderlying: closedPosition.entryUnderlying ?? null,
        exitUnderlying: spot ?? null,
        stopPremium: closedPosition.stopPremium ?? null,
        targetPremium: closedPosition.targetPremium ?? null,
        stopUnderlying: closedPosition.stopUnderlying,
        targetUnderlying: closedPosition.targetUnderlying,
        atrUsed: closedPosition.atrUsed ?? null,
        strategies: row.lastSignal?.strategies ?? null,
        entryReason: row.lastSignal?.reason ?? null,
        exitReason: reasonTag,
        configVersion: configVersionOf(
          settings as unknown as Record<string, unknown>,
        ),
      });
    }

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

  /**
   * One scheduler, every user's bot.
   *
   * Sequential rather than parallel: each user's tick makes Schwab REST
   * calls, and Schwab's rate limit is per-app, so fanning out would spend
   * the budget that order placement needs. A user whose tick throws must not
   * stop the rest of the queue — so failures are caught per user.
   */
  private async heartbeatAllUsers(): Promise<void> {
    let rows: Array<{ userId: string }>;
    try {
      rows = await this.botStateService.listActiveBotUsers();
    } catch (err) {
      this.logger.warn(`heartbeat user scan failed: ${err.message}`);
      return;
    }

    this.reconcileStreamerHolds(rows.map((row) => row.userId));

    for (const { userId } of rows) {
      await runAsUser(userId, () => this.heartbeat()).catch((err) =>
        this.logger.warn(`heartbeat failed for user ${userId}: ${err.message}`),
      );
    }
  }

  /**
   * Keeps a background streamer session open for exactly the users whose bot
   * is armed (`mode === BOT`, from `listActiveBotUsers`), independent of any
   * browser tab.
   *
   * Before this, the engine only ever `peek()`ed at a session someone else —
   * a browser socket — had acquired. A closed tab tore the feed down mid-
   * position (2026-09-21: an armed paper position was force-flattened under
   * `SOCKET_LOSS` eight seconds after entry, with no actual Schwab outage),
   * and an unattended arm (the daily paper supervisor) never got live data
   * at all.
   *
   * Runs every heartbeat tick, so it also self-heals: after a dyno restart
   * `botHeldUserIds` starts empty, and the very next tick re-acquires a hold
   * for every currently-armed user from the database, not from in-memory
   * socket state.
   */
  private reconcileStreamerHolds(armedUserIds: readonly string[]): void {
    const { toAcquire, toRelease } = diffStreamerHolds(
      armedUserIds,
      this.botHeldUserIds,
    );

    for (const userId of toAcquire) {
      try {
        this.streamerPool.acquireForBackgroundWork(userId);
        this.botHeldUserIds.add(userId);
      } catch (err) {
        // Pool at capacity. This user's risk checks will see `peek()` return
        // null and treat it the same as any other unrecoverable outage.
        this.logger.warn(
          `Could not hold a background streamer for user ${userId}: ${err.message}`,
        );
      }
    }

    for (const userId of toRelease) {
      this.streamerPool.releaseBackgroundWork(userId);
      this.botHeldUserIds.delete(userId);
    }
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

      // Lazy per-user seed: this user's bot is armed, so the strategy is
      // about to read the candle buffer. No-ops after the first tick.
      await this.botMarketDataService.ensureSeeded();

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

      if (
        shouldForceFlattenForSocketLoss({
          hasOpenPosition: Boolean(row.openPosition),
          disconnectedForMs: this.streamerSession
            ? this.streamerSession.getDisconnectedForMs()
            : null,
          graceMs: SOCKET_LOSS_GRACE_MS,
        })
      ) {
        await this.flattenAndHalt('SOCKET_LOSS', KillScope.ALL);
        return;
      }

      if (row.openPosition) {
        const spot = this.streamerSession?.getLastKnownSpotPrice() ?? null;
        if (spot != null) {
          await this.checkSoftStopAndTargets(spot);
        }
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
      const qty = match ? Number(match.quantity ?? 0) : 0;

      // Operator flattened (or fill landed outside bot) — clear without day lockout.
      if (qty <= 0) {
        const closed = row.openPosition;
        row.openPosition = null;
        await this.botStateService.save(row);
        await this.botEventService.record({
          lane: row.lane,
          type: BotEventType.EXIT_FILL,
          symbol: closed.symbol,
          quantity: closed.quantity,
          reason: 'OPERATOR_FLAT',
        });
        this.logger.warn(
          `OPERATOR_FLAT: cleared nest openPosition for ${closed.symbol} (Schwab flat)`,
        );
        await this.emitStatus(true);
        return;
      }

      if (qty < row.openPosition.quantity) {
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
    if (!force && now - this.stateFor().lastStatusEmitAt < 1000) return;
    this.stateFor().lastStatusEmitAt = now;
    const status = await this.botStateService.getStatus();

    if (
      this.stateFor().lastEmittedPhase !== null &&
      status.phase !== this.stateFor().lastEmittedPhase
    ) {
      await this.botEventService.record({
        lane: status.lane,
        type: BotEventType.PHASE,
        reason: `${this.stateFor().lastEmittedPhase} → ${status.phase}`,
      });
    }
    this.stateFor().lastEmittedPhase = status.phase;

    this.optionsGateway.emitBotStatus(requireUserId(), status);
  }
}
