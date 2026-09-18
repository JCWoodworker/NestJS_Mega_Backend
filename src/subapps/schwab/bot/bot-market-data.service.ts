import { Injectable, Logger } from '@nestjs/common';

import { MarketDataService } from '@schwab/market-data/market-data.service';
import { requireUserId } from '@schwab/shared/schwab-user-context';
import {
  ChartCandlePayload,
  OptionsGateway,
} from '@schwab/streaming/options.gateway';

import { BotCandle } from './bot-strategy.util';

const RING_SIZE = 100;

/** Maintains a rolling buffer of 1m SPY candles for the strategy loop. */
@Injectable()
export class BotMarketDataService {
  private readonly logger = new Logger(BotMarketDataService.name);
  /** Per user: the strategy reads this buffer to compute VWAP/ATR, so mixing
   * two accounts' bars would corrupt both users' indicators. Keyed by user
   * rather than symbol because each session subscribes one underlying. */
  private readonly buffers = new Map<
    string,
    { candles: BotCandle[]; seeded: boolean }
  >();
  private listening = false;

  constructor(
    private readonly marketDataService: MarketDataService,
    private readonly optionsGateway: OptionsGateway,
  ) {}

  private bufferFor(userId: string) {
    const existing = this.buffers.get(userId);
    if (existing) return existing;
    const fresh = { candles: [] as BotCandle[], seeded: false };
    this.buffers.set(userId, fresh);
    return fresh;
  }

  /** Gateway events carry the userId, so each user's bars land in their own
   * buffer. EventEmitter listeners are untyped, so getting this wrong would
   * not have been a compile error. */
  private handleChartCandle = (
    userId: string,
    payload: ChartCandlePayload,
  ): void => {
    if (payload.assetType !== 'EQUITY') return;
    this.push(userId, {
      open: payload.open,
      high: payload.high,
      low: payload.low,
      close: payload.close,
      volume: payload.volume,
      chartTime: payload.chartTime,
    });
  };

  startListening(): void {
    if (this.listening) return;
    this.optionsGateway.on('chart-candle', this.handleChartCandle);
    this.listening = true;
  }

  stopListening(): void {
    if (!this.listening) return;
    this.optionsGateway.off('chart-candle', this.handleChartCandle);
    this.listening = false;
  }

  async ensureSeeded(symbol = 'SPY', userId = requireUserId()): Promise<void> {
    const buffer = this.bufferFor(userId);
    if (buffer.seeded) return;
    try {
      const { candles } = await this.marketDataService.getPriceHistory({
        symbol,
        periodType: 'day',
        period: 1,
        frequencyType: 'minute',
        frequency: 1,
      });
      buffer.candles = candles.slice(-RING_SIZE).map((c) => ({
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        chartTime: c.datetime,
      }));
      buffer.seeded = true;
      this.logger.log(
        `Seeded ${buffer.candles.length} 1m candles for ${symbol} (user ${userId})`,
      );
    } catch (err) {
      this.logger.warn(`Failed to seed candle buffer: ${err.message}`);
    }
  }

  private push(userId: string, candle: BotCandle): void {
    const buffer = this.bufferFor(userId);
    const last = buffer.candles[buffer.candles.length - 1];
    if (last && last.chartTime === candle.chartTime) {
      buffer.candles[buffer.candles.length - 1] = candle;
    } else {
      buffer.candles.push(candle);
    }
    if (buffer.candles.length > RING_SIZE) {
      buffer.candles.splice(0, buffer.candles.length - RING_SIZE);
    }
  }

  getCandles(userId = requireUserId()): BotCandle[] {
    return this.bufferFor(userId).candles;
  }

  /** Drops a user's buffer when their bot stops, so an idle tenant does not
   * hold 100 candles indefinitely. */
  forget(userId: string): void {
    this.buffers.delete(userId);
  }
}
