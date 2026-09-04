import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { ExpirationsQueryDto } from './dto/expirations-query.dto';
import { OptionChainQueryDto } from './dto/option-chain-query.dto';
import { PriceHistoryQueryDto } from './dto/price-history-query.dto';
import { MarketDataService } from './market-data.service';

/**
 * Overrides this app's global default rate limit (10 req/60s) - a trader
 * flipping between chart timeframes (1m/5m/15m/30m/1D) can easily fire more
 * than 10 backfill requests a minute. Schwab's own market-data rate limit is
 * far higher than this, so this just keeps our own guard out of the way.
 * Non-0DTE chain panes poll ~1–2s; 60/min still leaves headroom with Nest cache.
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

  /** Nearest option expirations for the multi-exp accordion (§11c). */
  @Get('expirations')
  async getExpirations(@Query() query: ExpirationsQueryDto) {
    return this.marketDataService.getExpirations(query);
  }

  /** Option-chain quote snapshot (§11b / §11c). Optional `expiration=YYYY-MM-DD`
   * (omit = today 0DTE). Non-0DTE panes poll this; 0DTE socket ladder unchanged. */
  @Get('chain')
  async getOptionChain(@Query() query: OptionChainQueryDto) {
    return this.marketDataService.getOptionChain(query);
  }
}
