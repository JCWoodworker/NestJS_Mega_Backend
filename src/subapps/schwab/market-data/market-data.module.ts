import { Module } from '@nestjs/common';

import { SchwabHttpModule } from '@schwab/http/schwab-http.module';

import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';

@Module({
  imports: [SchwabHttpModule],
  controllers: [MarketDataController],
  providers: [MarketDataService],
  exports: [MarketDataService],
})
export class MarketDataModule {}
