import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SchwabAuthModule } from './auth/schwab-auth.module';
import schwabConfig from './config/schwab.config';
import { MarketDataModule } from './market-data/market-data.module';
import { OrdersModule } from './orders/orders.module';
import { PnlModule } from './pnl/pnl.module';
import { SchwabStreamingModule } from './streaming/schwab-streaming.module';

@Module({
  imports: [
    ConfigModule.forFeature(schwabConfig),
    SchwabAuthModule,
    SchwabStreamingModule,
    OrdersModule,
    MarketDataModule,
    PnlModule,
  ],
})
export class SchwabModule {}
