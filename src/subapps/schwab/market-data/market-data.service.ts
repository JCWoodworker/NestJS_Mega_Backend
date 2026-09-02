import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

import { PriceHistoryQueryDto } from './dto/price-history-query.dto';

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
}
