import { Injectable, Logger } from '@nestjs/common';

import { MarketDataService } from '@schwab/market-data/market-data.service';
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
  private candles: BotCandle[] = [];
  private seeded = false;
  private listening = false;

  constructor(
    private readonly marketDataService: MarketDataService,
    private readonly optionsGateway: OptionsGateway,
  ) {}

  private handleChartCandle = (payload: ChartCandlePayload): void => {
    if (payload.assetType !== 'EQUITY') return;
    this.push({
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

  async ensureSeeded(symbol = 'SPY'): Promise<void> {
    if (this.seeded) return;
    try {
      const { candles } = await this.marketDataService.getPriceHistory({
        symbol,
        periodType: 'day',
        period: 1,
        frequencyType: 'minute',
        frequency: 1,
      });
      this.candles = candles.slice(-RING_SIZE).map((c) => ({
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        chartTime: c.datetime,
      }));
      this.seeded = true;
      this.logger.log(`Seeded ${this.candles.length} 1m candles for ${symbol}`);
    } catch (err) {
      this.logger.warn(`Failed to seed candle buffer: ${err.message}`);
    }
  }

  private push(candle: BotCandle): void {
    const last = this.candles[this.candles.length - 1];
    if (last && last.chartTime === candle.chartTime) {
      this.candles[this.candles.length - 1] = candle;
    } else {
      this.candles.push(candle);
    }
    if (this.candles.length > RING_SIZE) {
      this.candles.splice(0, this.candles.length - RING_SIZE);
    }
  }

  getCandles(): BotCandle[] {
    return this.candles;
  }
}
