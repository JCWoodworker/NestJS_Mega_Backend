import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

import { OptionChainQueryDto } from './dto/option-chain-query.dto';
import { PriceHistoryQueryDto } from './dto/price-history-query.dto';
import {
  mapOptionChainResponse,
  OptionChainQuote,
} from './option-chain.mapper';

export interface NormalizedCandle {
  datetime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceHistoryResponse {
  symbol: string;
  candles: NormalizedCandle[];
}

/**
 * Thin authenticated proxy to Schwab Market Data `GET /pricehistory`
 * (https://api.schwabapi.com/marketdata/v1/pricehistory), used for chart
 * backfill (frontend contract section 9a). Reuses `SchwabHttpModule`'s
 * `HttpService` - same Bearer interceptor + keep-alive agent as
 * `OrdersService`/`SchwabStreamerService` - so no separate auth wiring is
 * needed here.
 */
@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);

  constructor(private readonly httpService: HttpService) {}

  async getPriceHistory(
    query: PriceHistoryQueryDto,
  ): Promise<PriceHistoryResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.get('/marketdata/v1/pricehistory', {
          params: {
            symbol: query.symbol,
            periodType: query.periodType,
            period: query.period,
            frequencyType: query.frequencyType,
            frequency: query.frequency,
            startDate: query.startDate,
            endDate: query.endDate,
          },
        }),
      );

      const rawCandles: Array<Record<string, number>> =
        response.data?.candles ?? [];

      // Normalized shape per the contract - deliberately not passing
      // Schwab's raw envelope through (it also includes `symbol`/`empty` at
      // the top level, which we fold into our own response shape instead).
      const candles: NormalizedCandle[] = rawCandles.map((candle) => ({
        datetime: candle.datetime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      }));

      return { symbol: response.data?.symbol ?? query.symbol, candles };
    } catch (error) {
      this.logger.error(
        'Price history fetch failed',
        error?.response?.data || error.message,
      );
      throw new BadRequestException(
        error?.response?.data?.message || 'Price history fetch failed',
      );
    }
  }

  /**
   * Option-chain quote snapshot (frontend contract section 11b) - lets the
   * ladder paint instantly on load/reconnect instead of waiting for a
   * `option-ticks` per symbol, and gives a fallback when the streamer is
   * degraded. Thin proxy to Schwab's `GET /chains`, restricted to today's
   * expiration to match this app's 0DTE-only ladder (same date the streamer
   * itself subscribes against in `SchwabStreamerService.recenterLadder`).
   */
  async getOptionChain(
    query: OptionChainQueryDto,
  ): Promise<OptionChainQuote[]> {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const response = await firstValueFrom(
        this.httpService.get('/marketdata/v1/chains', {
          params: {
            symbol: query.symbol,
            contractType: 'ALL',
            strikeCount: query.strikeCount ?? 16,
            fromDate: today,
            toDate: today,
          },
        }),
      );

      const quotes = mapOptionChainResponse(response.data);
      if (!query.symbols) return quotes;

      const wanted = new Set(query.symbols.split(',').map((s) => s.trim()));
      return quotes.filter((q) => wanted.has(q.symbol));
    } catch (error) {
      this.logger.error(
        'Option chain fetch failed',
        error?.response?.data || error.message,
      );
      throw new BadRequestException(
        error?.response?.data?.message || 'Option chain fetch failed',
      );
    }
  }
}
