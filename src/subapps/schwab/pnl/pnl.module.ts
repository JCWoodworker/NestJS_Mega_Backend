import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SchwabToken } from '@schwab/auth/entities/schwab-token.entity';
import schwabConfig from '@schwab/config/schwab.config';
import { SchwabHttpModule } from '@schwab/http/schwab-http.module';
import { OrdersModule } from '@schwab/orders/orders.module';
import { SchwabSharedModule } from '@schwab/shared/schwab-shared.module';

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
      // The 15-minute sync iterates every connected user, so it reads the
      // token table directly rather than going through the auth module
      // (which would reintroduce a cycle).
      SchwabToken,
    ]),
    SchwabHttpModule,
    forwardRef(() => OrdersModule),
    forwardRef(() => SchwabSharedModule),
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
