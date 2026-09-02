import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SchwabAuthModule } from './auth/schwab-auth.module';
import schwabConfig from './config/schwab.config';
import { OrdersModule } from './orders/orders.module';
import { SchwabStreamingModule } from './streaming/schwab-streaming.module';

@Module({
  imports: [
    ConfigModule.forFeature(schwabConfig),
    SchwabAuthModule,
    SchwabStreamingModule,
    OrdersModule,
  ],
})
export class SchwabModule {}
