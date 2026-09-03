import { Module, forwardRef } from '@nestjs/common';

import { SchwabHttpModule } from '@schwab/http/schwab-http.module';
import { PnlModule } from '@schwab/pnl/pnl.module';

import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [SchwabHttpModule, forwardRef(() => PnlModule)],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
