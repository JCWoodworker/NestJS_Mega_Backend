import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';

import { SchwabAuthService } from '@schwab/auth/schwab-auth.service';
import schwabConfig from '@schwab/config/schwab.config';
import { MarketDataService } from '@schwab/market-data/market-data.service';
import { etDateKey } from '@schwab/pnl/et-date.util';
import { runAsUser } from '@schwab/shared/schwab-user-context';

import { commissionForRoundTrip } from './bot-fees.const';
import { etNowHhMm, isWithinWindow } from './bot-strategy.util';
import {
  computeTradeExcursion,
  computeTradePnl,
  tradeKeyFor,
} from './bot-trade-metrics.util';
import {
  BotCapitalEvent,
  BotCapitalEventReason,
} from './entities/bot-capital-event.entity';
import {
  BotChainSnapshot,
  ChainSnapshotQuote,
} from './entities/bot-chain-snapshot.entity';
import { BotMarketDay, MarketDayBar } from './entities/bot-market-day.entity';
import { BotTradeTape } from './entities/bot-trade-tape.entity';
import { BotTrade } from './entities/bot-trade.entity';
import { BotLane } from './enums/bot-lane.enum';
import { BotDirection, BotStrategy } from './enums/strategy.enum';

const TICK_MS = 60_000;
/** Session bounds for chain snapshots (ET). */
const SNAPSHOT_START = '09:30';
const SNAPSHOT_END = '16:00';
/** Backfill SPY bars once the session is safely over. */
const BACKFILL_AFTER = '16:05';
/** Strikes each side of the money to capture. */
const SNAPSHOT_STRIKE_COUNT = 16;

interface ParsedOsi {
  expiration: string;
  right: 'C' | 'P';
  strike: number;
}

/**
 * Short stable fingerprint of the settings that were in force for a trade, so
 * a later analysis can attribute results to the configuration that produced
 * them — and so a tuning change is visible as a boundary in the data.
 *
 * Keys are sorted and `updatedAt` is dropped, so a no-op save does not mint a
 * new version.
 */
export function configVersionOf(settings: Record<string, unknown>): string {
  const stable: Record<string, unknown> = {};
  for (const key of Object.keys(settings).sort()) {
    if (key === 'updatedAt' || key === 'id') continue;
    stable[key] = settings[key];
  }
  return createHash('sha256')
    .update(JSON.stringify(stable))
    .digest('hex')
    .slice(0, 16);
}

/** 21-char OSI: 6 root, 6 date (YYMMDD), 1 right, 8 strike (×1000). */
export function parseOsi(symbol: string): ParsedOsi | null {
  if (symbol.length !== 21) return null;
  const expiration = symbol.slice(6, 12);
  const right = symbol[12];
  const strikeRaw = symbol.slice(13, 21);
  if (!/^\d{6}$/.test(expiration)) return null;
  if (right !== 'C' && right !== 'P') return null;
  if (!/^\d{8}$/.test(strikeRaw)) return null;
  return { expiration, right, strike: Number(strikeRaw) / 1000 };
}

/**
 * Writes everything the end-of-day analyzer will need but cannot recover later.
 *
 * Three recording jobs live here:
 *  - the bid path of an open position (driven by the engine's exit loop, which
 *    already has the bid in hand, so this costs no extra Schwab calls);
 *  - a per-minute snapshot of the near-the-money chain, taken whether or not
 *    the bot is trading, since entry counterfactuals need the minutes we did
 *    *not* act on and `/chains` has no "as of" parameter;
 *  - SPY 1m bars, backfilled after the close because the underlying — unlike
 *    options — is reliably retrievable after the fact.
 */
@Injectable()
export class BotRecordingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotRecordingService.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  /** ET `YYYY-MM-DD HH:MM` of the last snapshot, so a 60s timer that drifts
   * cannot write the same minute twice. */
  private lastSnapshotMinute: string | null = null;
  private lastBackfilledDate: string | null = null;
  /** Last recurring tick problem, so it is logged on change rather than every minute. */
  private lastTickProblem: string | null = null;

  constructor(
    @InjectRepository(BotTradeTape)
    private readonly tapeRepository: Repository<BotTradeTape>,
    @InjectRepository(BotTrade)
    private readonly tradeRepository: Repository<BotTrade>,
    @InjectRepository(BotChainSnapshot)
    private readonly snapshotRepository: Repository<BotChainSnapshot>,
    @InjectRepository(BotMarketDay)
    private readonly marketDayRepository: Repository<BotMarketDay>,
    @InjectRepository(BotCapitalEvent)
    private readonly capitalEventRepository: Repository<BotCapitalEvent>,
    private readonly marketDataService: MarketDataService,
    private readonly schwabAuthService: SchwabAuthService,
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
  ) {}

  onModuleInit(): void {
    if (!this.config.botRecordingEnabled) {
      this.logger.log(
        'Bot recording disabled (BOT_RECORDING_ENABLED is not true) — no chain snapshots on this app',
      );
      return;
    }
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.logger.log(
      'Bot recording enabled — chain snapshots every 60s in-session',
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // --- Trade tape -----------------------------------------------------------

  /**
   * Record one observation of an open position. Called from the engine's
   * soft-exit loop, which already fetched the bid to evaluate stops.
   *
   * Never throws: a recording failure must not be able to interfere with exit
   * logic that is protecting real (or simulated) capital.
   */
  async recordTapeSample(params: {
    symbol: string;
    openedAt: number;
    lane: BotLane;
    at: number;
    optionBid: number | null;
    optionAsk: number | null;
    spot: number | null;
  }): Promise<void> {
    try {
      await this.tapeRepository.insert({
        tradeKey: tradeKeyFor(params.symbol, params.openedAt),
        at: String(params.at),
        symbol: params.symbol,
        lane: params.lane,
        optionBid: params.optionBid,
        optionAsk: params.optionAsk,
        spot: params.spot,
      });
    } catch (err) {
      this.logger.warn(`tape sample failed: ${(err as Error).message}`);
    }
  }

  // --- Completed trades -----------------------------------------------------

  /**
   * Derive and persist the analytics row for a finished round trip.
   *
   * Enriches the existing realized-trade ledger rather than duplicating it:
   * P&L is recomputed here only so it can be stated net of modeled commission,
   * which the FIFO matcher does not account for on either lane.
   */
  async recordTradeClose(params: {
    symbol: string;
    openedAt: number;
    closedAt: number;
    lane: BotLane;
    direction: BotDirection | null;
    quantity: number;
    entryPrice: number;
    exitPrice: number;
    entryUnderlying: number | null;
    exitUnderlying: number | null;
    stopPremium: number | null;
    targetPremium: number | null;
    stopUnderlying: number | null;
    targetUnderlying: number | null;
    atrUsed: number | null;
    strategies: BotStrategy[] | null;
    entryReason: string | null;
    exitReason: string | null;
    configVersion: string | null;
  }): Promise<void> {
    const tradeKey = tradeKeyFor(params.symbol, params.openedAt);
    try {
      const rows = await this.tapeRepository.find({
        where: { tradeKey },
        order: { at: 'ASC' },
      });
      const samples = rows.map((r) => ({
        at: Number(r.at),
        optionBid: r.optionBid == null ? null : Number(r.optionBid),
      }));

      const excursion = computeTradeExcursion({
        samples,
        entryPrice: params.entryPrice,
        exitPrice: params.exitPrice,
        openedAt: params.openedAt,
      });
      const pnl = computeTradePnl({
        entryPrice: params.entryPrice,
        exitPrice: params.exitPrice,
        quantity: params.quantity,
        fees: commissionForRoundTrip(params.quantity),
      });

      await this.tradeRepository.upsert(
        {
          tradeKey,
          etDateKey: etDateKey(new Date(params.closedAt)),
          lane: params.lane,
          symbol: params.symbol,
          direction: params.direction,
          quantity: params.quantity,
          openedAt: new Date(params.openedAt),
          closedAt: new Date(params.closedAt),
          holdMs: Math.max(0, params.closedAt - params.openedAt),
          entryPrice: params.entryPrice,
          exitPrice: params.exitPrice,
          entryUnderlying: params.entryUnderlying,
          exitUnderlying: params.exitUnderlying,
          grossPnl: pnl.grossPnl,
          fees: pnl.fees,
          netPnl: pnl.netPnl,
          mfePremium: excursion.mfePremium,
          maePremium: excursion.maePremium,
          timeToMfeMs: excursion.timeToMfeMs,
          captureEfficiency: excursion.captureEfficiency,
          sampleCount: excursion.sampleCount,
          stopPremium: params.stopPremium,
          targetPremium: params.targetPremium,
          stopUnderlying: params.stopUnderlying,
          targetUnderlying: params.targetUnderlying,
          atrUsed: params.atrUsed,
          strategies: params.strategies,
          entryReason: params.entryReason,
          exitReason: params.exitReason,
          configVersion: params.configVersion,
          regime: null,
        },
        ['tradeKey'],
      );

      this.logger.log(
        `Recorded trade ${tradeKey}: net ${pnl.netPnl.toFixed(2)} ` +
          `(gross ${pnl.grossPnl.toFixed(2)}, fees ${pnl.fees.toFixed(2)}), ` +
          `${excursion.sampleCount} tape samples`,
      );
    } catch (err) {
      this.logger.warn(
        `recordTradeClose failed for ${tradeKey}: ${(err as Error).message}`,
      );
    }
  }

  // --- Capital ledger -------------------------------------------------------

  /**
   * Log a capital injection. Cumulative performance is derived as
   * `balance − starting capital − Σ injections`, so an unlogged reset makes the
   * equity curve permanently wrong.
   */
  async recordCapitalEvent(params: {
    reason: BotCapitalEventReason;
    lane: BotLane | null;
    balanceBefore: number;
    balanceAfter: number;
  }): Promise<void> {
    try {
      const at = new Date();
      await this.capitalEventRepository.insert({
        at,
        etDateKey: etDateKey(at),
        lane: params.lane,
        reason: params.reason,
        balanceBefore: params.balanceBefore,
        balanceAfter: params.balanceAfter,
        amount: params.balanceAfter - params.balanceBefore,
      });
    } catch (err) {
      this.logger.warn(`capital event failed: ${(err as Error).message}`);
    }
  }

  // --- Scheduled recording --------------------------------------------------

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      // The improvement loop trains on the owner's account only, so the
      // recorder reads market data through the owner's Schwab connection.
      // Without a configured owner there is nothing to record against.
      const ownerUserId = this.config.ownerUserId;
      if (!ownerUserId) {
        this.logDeduped(
          'Skipping recording tick: SCHWAB_OWNER_USER_ID is not configured',
        );
        return;
      }

      // Every Schwab call is doomed without a token, and the price-history
      // wrapper swallows the underlying 'not connected' detail — so check
      // first and skip quietly, the way the sibling pollers do, rather than
      // emitting a failure every minute of every session.
      const { connected } =
        await this.schwabAuthService.getConnectionStatus(ownerUserId);
      if (!connected) {
        this.logDeduped(
          'Skipping recording tick: Schwab account not connected',
        );
        return;
      }

      const nowHhMm = etNowHhMm();
      await runAsUser(ownerUserId, async () => {
        if (isWithinWindow(nowHhMm, SNAPSHOT_START, SNAPSHOT_END)) {
          await this.snapshotChain(nowHhMm);
        } else if (nowHhMm >= BACKFILL_AFTER && nowHhMm < '23:59') {
          await this.backfillMarketDay();
        }
      });
      this.lastTickProblem = null;
    } catch (err) {
      // A persistent failure would otherwise log 390 times a session.
      this.logDeduped(`recording tick failed: ${(err as Error).message}`);
    } finally {
      this.ticking = false;
    }
  }

  /** Log a recurring problem once, and again only when it changes. */
  private logDeduped(message: string): void {
    if (this.lastTickProblem === message) return;
    this.lastTickProblem = message;
    this.logger.warn(message);
  }

  private async snapshotChain(nowHhMm: string): Promise<void> {
    const dateKey = etDateKey();
    const minuteKey = `${dateKey} ${nowHhMm}`;
    if (this.lastSnapshotMinute === minuteKey) return;

    const chain = await this.marketDataService.getOptionChain({
      symbol: this.config.underlyingSymbol ?? 'SPY',
      strikeCount: SNAPSHOT_STRIKE_COUNT,
    });
    if (!chain.length) return;

    let expiration: string | null = null;
    const quotes: ChainSnapshotQuote[] = [];
    for (const q of chain) {
      const parsed = parseOsi(q.symbol);
      if (!parsed) continue;
      expiration ??= parsed.expiration;
      quotes.push([
        parsed.strike,
        parsed.right === 'C' ? 0 : 1,
        q.delta ?? null,
        q.bid ?? null,
        q.ask ?? null,
      ]);
    }
    if (!quotes.length) return;

    await this.snapshotRepository.insert({
      at: String(Date.now()),
      etDateKey: dateKey,
      etHhMm: nowHhMm,
      underlyingSymbol: this.config.underlyingSymbol ?? 'SPY',
      spot: null,
      expiration,
      quotes,
    });
    this.lastSnapshotMinute = minuteKey;
  }

  /**
   * Pull the session's SPY 1m bars once the close has passed. Idempotent — a
   * restart mid-evening re-runs harmlessly and a re-fetch just overwrites.
   */
  async backfillMarketDay(dateKey = etDateKey()): Promise<void> {
    if (this.lastBackfilledDate === dateKey) return;
    const existing = await this.marketDayRepository.findOne({
      where: { etDateKey: dateKey },
    });
    if (existing) {
      this.lastBackfilledDate = dateKey;
      return;
    }

    const symbol = this.config.underlyingSymbol ?? 'SPY';
    const { candles } = await this.marketDataService.getPriceHistory({
      symbol,
      periodType: 'day',
      period: 1,
      frequencyType: 'minute',
      frequency: 1,
    });
    if (!candles.length) return;

    const bars: MarketDayBar[] = candles.map((c) => [
      c.datetime,
      c.open,
      c.high,
      c.low,
      c.close,
      c.volume,
    ]);

    await this.marketDayRepository.save({
      etDateKey: dateKey,
      symbol,
      bars,
      barCount: bars.length,
      // A regular session is 390 one-minute bars; anything materially short is
      // an early close or a partial fetch, and the analyzer should know.
      fullSession: bars.length >= 380,
    });
    this.lastBackfilledDate = dateKey;
    this.logger.log(
      `Backfilled ${bars.length} ${symbol} 1m bars for ${dateKey}`,
    );
  }
}
