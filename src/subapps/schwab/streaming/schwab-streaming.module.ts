import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import jwtConfig from '@iam/config/jwt.config';

import { SchwabAuthModule } from '@schwab/auth/schwab-auth.module';
import schwabConfig from '@schwab/config/schwab.config';
import { SchwabHttpModule } from '@schwab/http/schwab-http.module';
import { OrdersModule } from '@schwab/orders/orders.module';
import { PnlModule } from '@schwab/pnl/pnl.module';
import { SchwabSharedModule } from '@schwab/shared/schwab-shared.module';

import { AccountSnapshotService } from './account-snapshot.service';
import { OptionsGateway } from './options.gateway';
import { OrderUpdatesService } from './order-updates.service';
import { SchwabStreamerPool } from './schwab-streamer-pool.service';

@Module({
  imports: [
    ConfigModule.forFeature(schwabConfig),
    ConfigModule.forFeature(jwtConfig),
    JwtModule.registerAsync(jwtConfig.asProvider()),
    SchwabAuthModule,
    SchwabHttpModule,
    OrdersModule,
    PnlModule,
    SchwabSharedModule,
  ],
  providers: [
    OptionsGateway,
    SchwabStreamerPool,
    AccountSnapshotService,
    OrderUpdatesService,
  ],
  exports: [OptionsGateway, SchwabStreamerPool],
})
export class SchwabStreamingModule {}
