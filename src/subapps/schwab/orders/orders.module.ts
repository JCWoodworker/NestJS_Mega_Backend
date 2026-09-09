import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import schwabConfig from '@schwab/config/schwab.config';
import { SchwabHttpModule } from '@schwab/http/schwab-http.module';
import { PnlModule } from '@schwab/pnl/pnl.module';

import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    ConfigModule.forFeature(schwabConfig),
    SchwabHttpModule,
    forwardRef(() => PnlModule),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
