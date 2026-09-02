import { Module } from '@nestjs/common';

import { SchwabHttpModule } from '@schwab/http/schwab-http.module';

import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [SchwabHttpModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
