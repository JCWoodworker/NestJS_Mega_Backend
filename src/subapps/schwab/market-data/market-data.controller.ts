import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { OptionChainQueryDto } from './dto/option-chain-query.dto';
import { PriceHistoryQueryDto } from './dto/price-history-query.dto';
import { MarketDataService } from './market-data.service';

/**
 * Overrides this app's global default rate limit (10 req/60s) - a trader
 * flipping between chart timeframes (1m/5m/15m/30m/1D) can easily fire more
 * than 10 backfill requests a minute. Schwab's own market-data rate limit is
 * far higher than this, so this just keeps our own guard out of the way.
 */
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('market-data')
export class MarketDataController {
  constructor(private readonly marketDataService: MarketDataService) {}

  /** Chart backfill (frontend contract section 9a). Requires the same
   * `Authorization: Bearer <accessToken>` as `/orders/*`. */
  @Get('price-history')
  async getPriceHistory(@Query() query: PriceHistoryQueryDto) {
    return this.marketDataService.getPriceHistory(query);
  }

  /** Option-chain quote snapshot (frontend contract section 11b) - first
   * paint on load/reconnect, and a fallback when the streamer is degraded. */
  @Get('chain')
  async getOptionChain(@Query() query: OptionChainQueryDto) {
    return this.marketDataService.getOptionChain(query);
  }
}
