import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import schwabConfig from '@schwab/config/schwab.config';
import { SchwabHttpModule } from '@schwab/http/schwab-http.module';
import { OrdersModule } from '@schwab/orders/orders.module';

import { DailyPnlService } from './daily-pnl.service';
import { SchwabDailyPnl } from './entities/schwab-daily-pnl.entity';
import { SchwabOrderHistory } from './entities/schwab-order-history.entity';
import { SchwabOrderSourceTag } from './entities/schwab-order-source-tag.entity';
import { SchwabRealizedTrade } from './entities/schwab-realized-trade.entity';
import { SchwabTradeFill } from './entities/schwab-trade-fill.entity';
import { SchwabTransaction } from './entities/schwab-transaction.entity';
import { OrderHistoryService } from './order-history.service';
import { OrderSourceTagService } from './order-source-tag.service';
import { PnlController } from './pnl.controller';
import { PnlService } from './pnl.service';
import { RealizedPnlService } from './realized-pnl.service';
import { TransactionSyncService } from './transaction-sync.service';

@Module({
  imports: [
    ConfigModule.forFeature(schwabConfig),
    TypeOrmModule.forFeature([
      SchwabTransaction,
      SchwabTradeFill,
      SchwabRealizedTrade,
      SchwabDailyPnl,
      SchwabOrderHistory,
      SchwabOrderSourceTag,
    ]),
    SchwabHttpModule,
    forwardRef(() => OrdersModule),
  ],
  controllers: [PnlController],
  providers: [
    PnlService,
    TransactionSyncService,
    RealizedPnlService,
    DailyPnlService,
    OrderHistoryService,
    OrderSourceTagService,
  ],
  exports: [
    DailyPnlService,
    OrderHistoryService,
    TransactionSyncService,
    OrderSourceTagService,
    RealizedPnlService,
  ],
})
export class PnlModule {}
