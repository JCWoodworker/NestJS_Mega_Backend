import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { commissionForLeg, commissionForRoundTrip } from '@schwab/bot/bot-fees.const';
import {
  breakevenBidFor,
  computeExitLevels,
  minLockBidFor,
  shouldForceFlattenForSocketLoss,
} from '@schwab/bot/bot-exit.util';
import { BotStateService } from '@schwab/bot/bot-state.service';
import {
  BotCandle,
  combineSignals,
  etNowHhMm,
  etSessionStartMs,
  isAtOrPast,
  isDirectionAllowed,
  isWithinWindow,
} from '@schwab/bot/bot-strategy.util';
import { computeTradePnl } from '@schwab/bot/bot-trade-metrics.util';
import { selectContractDetailed } from '@schwab/bot/bot-strike-selection.util';
import { BotMode } from '@schwab/bot/enums/bot-mode.enum';
import { BotCombineMode, BotDirection } from '@schwab/bot/enums/strategy.enum';
import {
  buildStrategyContext,
  evaluateEnabled,
} from '@schwab/bot/strategies/registry';
import { MarketDataService } from '@schwab/market-data/market-data.service';
import { etDateKey } from '@schwab/pnl/et-date.util';
import { requireUserId, runAsUser } from '@schwab/shared/schwab-user-context';
import {
  ChartCandlePayload,
  OptionsGateway,
  UnderlyingPricePayload,
} from '@schwab/streaming/options.gateway';
import { OptionTick } from '@schwab/streaming/option-tick.mapper';
import { SchwabStreamerPool } from '@schwab/streaming/schwab-streamer-pool.service';

import { pushPriceBar } from './bot-v2-bars.util';
import { v2ConfigVersion } from './bot-v2-config.util';
import { BotV2SettingsService } from './bot-v2-settings.service';
import { sizeAtRisk } from './bot-v2-sizing.util';
import { BotV2StateService } from './bot-v2-state.service';
import { decideTickExit, V2ExitReason } from './bot-v2-tick-exit.util';
import { BotV2Event } from './entities/bot-v2-event.entity';
import { BotV2OpenPosition } from './entities/bot-v2-position';
import { BotV2Settings } from './entities/bot-v2-settings.entity';
import { BotV2Trade } from './entities/bot-v2-trade.entity';

const HEARTBEAT_MS = 7_000;
const QUOTE_FRESHNESS_MS = 2_000;
const SOCKET_LOSS_GRACE_MS = 15_000;
const SESSION_CAP = 500;

interface Book {
  minute: BotCandle[];
  microClosed: BotCandle[];
  microForming: BotCandle | null;
  spot: number | null;
  settings: BotV2Settings | null;
  position: BotV2OpenPosition | null;
  running: boolean;
  evaluating: boolean;
  exiting: boolean;
}

@Injectable()
export class BotV2EngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotV2EngineService.name);
  private readonly books = new Map<string, Book>();
  private readonly held = new Set<string>();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly gateway: OptionsGateway,
    private readonly pool: SchwabStreamerPool,
    private readonly marketData: MarketDataService,
    private readonly champion: BotStateService,
    private readonly settingsService: BotV2SettingsService,
    private readonly stateService: BotV2StateService,
    @InjectRepository(BotV2Trade)
    private readonly trades: Repository<BotV2Trade>,
    @InjectRepository(BotV2Event)
    private readonly events: Repository<BotV2Event>,
  ) {}

  onModuleInit(): void {
    this.gateway.on('option-ticks', this.onOptionTicks);
    this.gateway.on('underlying-price', this.onUnderlyingPrice);
    this.gateway.on('chart-candle', this.onChartCandle);
    this.heartbeatTimer = setInterval(() => void this.heartbeatAll(), HEARTBEAT_MS);
  }

  onModuleDestroy(): void {
    this.gateway.off('option-ticks', this.onOptionTicks);
    this.gateway.off('underlying-price', this.onUnderlyingPrice);
    this.gateway.off('chart-candle', this.onChartCandle);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
  }

  async arm(): Promise<void> {
    const userId = requireUserId();
    await this.champion.releaseFeedForTrainer();
    const settings = await this.settingsService.get(userId);
    const row = await this.stateService.get(userId);
    row.mode = 'BOT';
    row.running = true;
    row.lockout = false;
    row.lockoutReason = null;
    await this.stateService.save(row);
    const session = this.pool.acquireForBackgroundWork(userId);
    this.held.add(userId);
    session.setFeedLock(settings.botUnderlying);
    if (session.getUnderlyingSymbol() !== settings.botUnderlying) {
      await session.switchUnderlying(settings.botUnderlying, {
        force: true,
        ignoreLock: true,
      });
    }
    const book = this.book(userId);
    book.settings = settings;
    book.position = row.openPosition;
    book.running = true;
    await this.seedMinuteBars(userId, settings.botUnderlying);
    await this.record(userId, 'ARMED', settings.botUnderlying, null);
  }

  async stop(reason = 'STOP'): Promise<void> {
    const userId = requireUserId();
    const book = this.book(userId);
    const row = await this.stateService.get(userId);
    book.settings = book.settings ?? (await this.settingsService.get(userId));
    book.position = book.position ?? row.openPosition;
    await this.standDown(userId, reason);
  }

  private onOptionTicks = (userId: string, ticks: OptionTick[]): void => {
    const receivedAt = Date.now();
    void runAsUser(userId, () => this.onTicks(userId, ticks, receivedAt));
  };

  private onUnderlyingPrice = (
    userId: string,
    payload: UnderlyingPricePayload,
  ): void => {
    void runAsUser(userId, () => this.onSpot(userId, payload));
  };

  private onChartCandle = (userId: string, candle?: ChartCandlePayload): void => {
    if (!candle || candle.assetType !== 'EQUITY') return;
    void runAsUser(userId, () => this.onMinute(userId, candle));
  };

  private async onTicks(
    userId: string,
    ticks: OptionTick[],
    receivedAt: number,
  ): Promise<void> {
    const book = this.books.get(userId);
    const position = book?.position;
    const settings = book?.settings;
    if (!book?.running || !position || !settings || book.exiting) return;
    const tick = ticks.find(
      (item) =>
        item.symbol.trim() === position.symbol.trim() &&
        item.bid != null &&
        item.bid > 0,
    );
    if (!tick || tick.bid == null) return;

    const decision = decideTickExit({
      ratchet: {
        entryPremium: position.entryPrice,
        optionBid: tick.bid,
        peakBid: position.peakBid ?? null,
        stopPremium: position.stopPremium ?? null,
        trailArmed: settings.useTrailStop ? position.trailArmed : false,
        trailArmPct: settings.useTrailStop ? Number(settings.trailArmPct) : 10_000,
        trailPct: Number(settings.trailPct),
        breakevenBid: breakevenBidFor(
          position.entryPrice,
          commissionForRoundTrip(1),
        ),
        minLockBid: minLockBidFor(
          position.entryPrice,
          Number(settings.trailMinLockPct),
        ),
      },
      exit: {
        direction: position.direction,
        spot: book.spot ?? 0,
        targetPremium: position.targetPremium,
        stopUnderlying: book.spot == null ? null : position.stopUnderlying,
        targetUnderlying: book.spot == null ? null : position.targetUnderlying,
      },
      useScaleOut: settings.useScaleOut,
      scaledOut: position.scaledOut,
      quantity: position.quantity,
      entryPremium: position.entryPrice,
    });

    position.peakBid = decision.ratchet.peakBid;
    position.trailArmed = decision.ratchet.trailArmed;
    position.stopPremium = decision.ratchet.stopPremium;
    position.stopPremiumSource = decision.ratchet.source;

    if (decision.type === 'HOLD') return;

    book.exiting = true;
    try {
      const latencyMs = Date.now() - receivedAt;
      if (decision.type === 'SCALE_OUT') {
        await this.sellSlice(userId, book, decision.quantity, 'SCALE_OUT', tick.bid, latencyMs);
        if (book.position) {
          const breakeven = breakevenBidFor(
            book.position.entryPrice,
            commissionForRoundTrip(1),
          );
          const stop = Math.max(book.position.stopPremium ?? 0, breakeven);
          book.position.scaledOut = true;
          if (book.position.stopPremium == null || stop > book.position.stopPremium) {
            book.position.stopPremium = stop;
            book.position.stopPremiumSource = 'TRAIL';
          }
          await this.persistPosition(userId, book);
        }
        this.logger.log(
          `v2 scale-out ${position.symbol} latency ${latencyMs}ms`,
        );
        return;
      }
      await this.sellSlice(
        userId,
        book,
        decision.quantity,
        decision.reason,
        tick.bid,
        latencyMs,
      );
      this.logger.log(
        `v2 exit ${decision.reason} ${position.symbol} latency ${latencyMs}ms`,
      );
    } finally {
      book.exiting = false;
    }
  }

  private async onSpot(
    userId: string,
    payload: UnderlyingPricePayload,
  ): Promise<void> {
    const book = this.books.get(userId);
    if (!book?.running || !book.settings) return;
    if (payload.symbol !== book.settings.botUnderlying) return;
    book.spot = payload.price;
    if (book.settings.signalBarSeconds !== 15) return;
    const step = pushPriceBar(
      book.microForming,
      payload.price,
      payload.timestamp,
      15,
    );
    book.microForming = step.current;
    if (!step.closed) return;
    book.microClosed.push(step.closed);
    if (book.microClosed.length > SESSION_CAP) {
      book.microClosed.splice(0, book.microClosed.length - SESSION_CAP);
    }
    await this.evaluateEntry(userId, book.microClosed, step.closed.chartTime);
  }

  private async onMinute(userId: string, candle: ChartCandlePayload): Promise<void> {
    const book = this.books.get(userId);
    if (!book?.running || !book.settings) return;
    if (candle.symbol !== book.settings.botUnderlying) return;
    this.pushMinute(book, {
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      chartTime: candle.chartTime,
    });
    if (book.settings.signalBarSeconds !== 60) return;
    await this.evaluateEntry(userId, book.minute, candle.chartTime);
  }

  private async evaluateEntry(
    userId: string,
    candles: BotCandle[],
    chartTime: number,
  ): Promise<void> {
    const book = this.book(userId);
    if (book.evaluating || book.position) return;
    book.evaluating = true;
    try {
      const row = await this.stateService.get(userId);
      const settings = book.settings ?? (await this.settingsService.get(userId));
      book.settings = settings;
      if (row.mode !== 'BOT' || !row.running || row.lockout) return;
      const nowHhMm = etNowHhMm();
      if (!isWithinWindow(nowHhMm, settings.tradeWindowStart, settings.tradeWindowEnd)) {
        return;
      }
      if (
        row.lastTradeAt &&
        Date.now() - row.lastTradeAt.getTime() < settings.cooldownMins * 60_000
      ) {
        return;
      }
      const session = this.pool.peek(userId);
      const lastFrameAt = session?.getLastFrameAt() ?? null;
      if (
        !session ||
        !session.isStreamConnected() ||
        lastFrameAt == null ||
        Date.now() - lastFrameAt > QUOTE_FRESHNESS_MS
      ) {
        return;
      }
      if (candles.length < 6 || book.spot == null) return;

      const ctx = buildStrategyContext(candles, etSessionStartMs(), settings.atrPeriod);
      const enabled = settings.strategiesEnabled;
      const results = evaluateEnabled(enabled, ctx);
      const agreement =
        settings.minStrategyAgreement > 1
          ? settings.minStrategyAgreement
          : settings.combineMode === BotCombineMode.CONFIRMING
            ? ('CONFIRMING' as const)
            : ('ANY' as const);
      const combined = combineSignals(enabled, results, chartTime, agreement);
      if (!combined) return;
      const direction = combined.direction;
      const allowed = isDirectionAllowed(direction, {
        directionsEnabled: [
          ...(settings.callsEnabled ? (['CALL'] as const) : []),
          ...(settings.putsEnabled ? (['PUT'] as const) : []),
        ],
        canBuyCalls: settings.canBuyCalls,
        canBuyPuts: settings.canBuyPuts,
      });
      if (!allowed) return;

      const chain = await this.marketData.getOptionChain({
        symbol: settings.botUnderlying,
        strikeCount: 16,
      });
      const picked = selectContractDetailed(chain, direction, {
        deltaMin: Number(settings.deltaMin),
        deltaMax: Number(settings.deltaMax),
        minPremium: Number(settings.minPremium),
        maxPremium: Number(settings.maxPremium),
        maxSpreadPct: Number(settings.maxSpreadPct),
      });
      const contract = picked.contract;
      if (!contract?.ask || contract.ask <= 0 || contract.bid == null) {
        await this.record(userId, 'SKIP', 'NO_CONTRACT', { diagnostics: picked.diagnostics });
        return;
      }

      const levels = computeExitLevels({
        entryPremium: contract.ask,
        spot: book.spot,
        atr: ctx.atr,
        direction,
        usePremiumStop: settings.usePremiumStop,
        premiumStopPct: Number(settings.premiumStopPct),
        usePremiumTarget: settings.usePremiumTarget,
        premiumTargetPct: Number(settings.premiumTargetPct),
        stopAtrMult: Number(settings.stopAtrMult),
        targetAtrMult: Number(settings.targetAtrMult),
      });
      const sized = sizeAtRisk({
        useRiskAtStop: settings.useRiskAtStop,
        maxRiskUsd: Number(settings.maxRiskUsd),
        ask: contract.ask,
        stopPremium: levels.stopPremium,
        settledCash: Number(row.paperSettledCash),
        equity: Number(row.paperEquity),
        riskPct: Number(settings.riskPct),
      });
      if (sized.qty < 1) {
        await this.record(userId, 'SKIP', sized.reason, null);
        return;
      }

      const fill = round2(contract.ask + settings.paperSlippageCents / 100);
      const entryFee = commissionForLeg(sized.qty);
      const cost = round2(fill * 100 * sized.qty + entryFee);
      if (cost > Number(row.paperSettledCash)) return;

      const position: BotV2OpenPosition = {
        positionId: crypto.randomUUID(),
        symbol: contract.symbol,
        underlying: settings.botUnderlying,
        direction: direction as BotDirection,
        quantity: sized.qty,
        originalQuantity: sized.qty,
        entryPrice: fill,
        openedAt: Date.now(),
        entryUnderlying: book.spot,
        stopUnderlying: levels.stopUnderlying,
        targetUnderlying: levels.targetUnderlying,
        stopPremium: levels.stopPremium,
        targetPremium: levels.targetPremium,
        initialStopPremium: levels.stopPremium,
        peakBid: contract.bid,
        trailArmed: false,
        stopPremiumSource: 'INITIAL',
        atrUsed: levels.atrUsed,
        scaledOut: false,
        signalBarSeconds: settings.signalBarSeconds,
        configVersion: v2ConfigVersion({
          botUnderlying: settings.botUnderlying,
          signalBarSeconds: settings.signalBarSeconds,
          settings: settings as unknown as Record<string, unknown>,
        }),
      };
      row.paperSettledCash = round2(Number(row.paperSettledCash) - cost);
      row.paperEquity = row.paperSettledCash;
      row.openPosition = position;
      row.lastTradeAt = new Date();
      await this.stateService.save(row);
      book.position = position;
      session.pinOptionSymbol(position.symbol);
      await this.record(userId, 'ENTRY', combined.reason, {
        symbol: position.symbol,
        quantity: position.quantity,
        fill,
      });
    } finally {
      book.evaluating = false;
    }
  }

  private async heartbeatAll(): Promise<void> {
    const userIds = await this.stateService.armedUserIds();
    for (const userId of userIds) {
      await runAsUser(userId, () => this.heartbeatUser(userId));
    }
  }

  private async heartbeatUser(userId: string): Promise<void> {
    const row = await this.stateService.get(userId);
    if (row.mode !== 'BOT' || !row.running) return;
    const settings = await this.settingsService.get(userId);
    const book = this.book(userId);
    book.settings = settings;
    // Tick exits ratchet peak and stop on the in-memory book. Replacing that
    // with the database row every heartbeat threw those updates away, so the
    // watch page never saw the trail move.
    const stored = row.openPosition;
    const live = book.position;
    if (
      !live ||
      !stored ||
      live.positionId !== stored.positionId ||
      live.symbol !== stored.symbol
    ) {
      book.position = stored;
    }
    book.running = true;
    const session = this.pool.peek(userId);
    if (book.position && session) session.pinOptionSymbol(book.position.symbol);
    if (isAtOrPast(etNowHhMm(), settings.hardFlattenTime) && book.position) {
      await this.flattenBook(userId, 'EOD_FLATTEN');
      return;
    }
    const disconnectedForMs = session ? session.getDisconnectedForMs() : null;
    if (
      shouldForceFlattenForSocketLoss({
        hasOpenPosition: book.position != null,
        disconnectedForMs,
        graceMs: SOCKET_LOSS_GRACE_MS,
      })
    ) {
      await this.flattenBook(userId, 'SOCKET_LOSS');
    } else if (book.position) {
      await this.persistPosition(userId, book);
    }
  }

  private async standDown(userId: string, reason: string): Promise<void> {
    const book = this.book(userId);
    if (book.position) await this.flattenBook(userId, 'STAND_DOWN');
    const row = await this.stateService.get(userId);
    row.mode = 'MANUAL';
    row.running = false;
    row.lockout = reason === 'CHAMPION_OWNS_FEED';
    row.lockoutReason = reason === 'CHAMPION_OWNS_FEED' ? reason : null;
    row.openPosition = null;
    await this.stateService.save(row);
    book.running = false;
    book.position = null;
    const champion = await this.champion.getRow(userId);
    if (champion.mode !== BotMode.BOT && this.held.has(userId)) {
      this.pool.peek(userId)?.setFeedLock(null);
      this.pool.releaseBackgroundWork(userId);
    }
    this.held.delete(userId);
    await this.record(userId, 'STAND_DOWN', reason, null);
  }

  private async flattenBook(
    userId: string,
    reason: 'EOD_FLATTEN' | 'SOCKET_LOSS' | 'STAND_DOWN',
  ): Promise<void> {
    const book = this.book(userId);
    const position = book.position;
    if (!position || book.exiting) return;
    book.exiting = true;
    try {
      const bid = position.peakBid && position.peakBid > 0 ? position.peakBid : position.entryPrice;
      await this.sellSlice(userId, book, position.quantity, reason, bid, null);
    } finally {
      book.exiting = false;
    }
  }

  private async sellSlice(
    userId: string,
    book: Book,
    quantity: number,
    reason: V2ExitReason | 'EOD_FLATTEN' | 'SOCKET_LOSS' | 'STAND_DOWN',
    bid: number,
    latencyMs: number | null,
  ): Promise<void> {
    const position = book.position;
    const settings = book.settings;
    if (!position || !settings || quantity < 1) return;
    const row = await this.stateService.get(userId);
    const fill = round2(Math.max(0.01, bid - settings.paperSlippageCents / 100));
    const exitFee = commissionForLeg(quantity);
    const pnl = computeTradePnl({
      entryPrice: position.entryPrice,
      exitPrice: fill,
      quantity,
      fees: commissionForRoundTrip(quantity),
    });
    await this.trades.save(
      this.trades.create({
        userId,
        positionId: position.positionId,
        symbol: position.symbol,
        underlying: position.underlying,
        direction: position.direction,
        quantity,
        entryPrice: position.entryPrice,
        exitPrice: fill,
        exitReason: reason,
        grossPnl: pnl.grossPnl,
        fees: pnl.fees,
        netPnl: pnl.netPnl,
        openedAt: String(position.openedAt),
        closedAt: String(Date.now()),
        signalBarSeconds: position.signalBarSeconds,
        configVersion: position.configVersion,
        decisionLatencyMs: latencyMs,
      }),
    );
    row.paperSettledCash = round2(
      Number(row.paperSettledCash) + fill * 100 * quantity - exitFee,
    );
    const remaining = position.quantity - quantity;
    if (remaining > 0) {
      position.quantity = remaining;
      row.openPosition = position;
      book.position = position;
    } else {
      row.openPosition = null;
      book.position = null;
      if (this.pool.peek(userId)) {
        this.pool.peek(userId)?.unpinOptionSymbol(position.symbol);
      }
    }
    row.paperEquity = row.paperSettledCash;
    row.lastTradeAt = new Date();
    await this.stateService.save(row);
    await this.record(userId, 'EXIT', reason, {
      symbol: position.symbol,
      quantity,
      fill,
      latencyMs,
      configVersion: position.configVersion,
    });
  }

  private async persistPosition(userId: string, book: Book): Promise<void> {
    const row = await this.stateService.get(userId);
    row.openPosition = book.position;
    await this.stateService.save(row);
  }

  private async seedMinuteBars(userId: string, symbol: string): Promise<void> {
    try {
      const { candles } = await this.marketData.getPriceHistory({
        symbol,
        periodType: 'day',
        period: 1,
        frequencyType: 'minute',
        frequency: 1,
      });
      const today = etDateKey();
      const book = this.book(userId);
      book.minute = candles
        .map((candle) => ({
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
          chartTime: candle.datetime,
        }))
        .filter((candle) => etDateKey(new Date(candle.chartTime)) === today)
        .slice(-SESSION_CAP);
    } catch (err) {
      this.logger.warn(`V2 candle seed failed: ${err.message}`);
    }
  }

  private pushMinute(book: Book, candle: BotCandle): void {
    const today = etDateKey(new Date(candle.chartTime));
    const last = book.minute[book.minute.length - 1];
    if (last && etDateKey(new Date(last.chartTime)) !== today) book.minute = [];
    if (last && last.chartTime === candle.chartTime) {
      book.minute[book.minute.length - 1] = candle;
    } else if (!last || candle.chartTime > last.chartTime) {
      book.minute.push(candle);
    }
    if (book.minute.length > SESSION_CAP) {
      book.minute.splice(0, book.minute.length - SESSION_CAP);
    }
  }

  private book(userId: string): Book {
    const existing = this.books.get(userId);
    if (existing) return existing;
    const fresh: Book = {
      minute: [],
      microClosed: [],
      microForming: null,
      spot: null,
      settings: null,
      position: null,
      running: false,
      evaluating: false,
      exiting: false,
    };
    this.books.set(userId, fresh);
    return fresh;
  }

  private async record(
    userId: string,
    type: string,
    reason: string | null,
    payload: Record<string, unknown> | null,
  ): Promise<void> {
    await this.events.save(this.events.create({ userId, type, reason, payload }));
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
