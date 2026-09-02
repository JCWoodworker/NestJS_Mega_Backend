import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import jwtConfig from '@iam/config/jwt.config';

import { SchwabAuthModule } from '@schwab/auth/schwab-auth.module';
import schwabConfig from '@schwab/config/schwab.config';
import { SchwabHttpModule } from '@schwab/http/schwab-http.module';
import { OrdersModule } from '@schwab/orders/orders.module';

import { AccountSnapshotService } from './account-snapshot.service';
import { OptionsGateway } from './options.gateway';
import { SchwabStreamerService } from './schwab-streamer.service';

@Module({
  imports: [
    ConfigModule.forFeature(schwabConfig),
    ConfigModule.forFeature(jwtConfig),
    JwtModule.registerAsync(jwtConfig.asProvider()),
    SchwabAuthModule,
    SchwabHttpModule,
    OrdersModule,
  ],
  providers: [OptionsGateway, SchwabStreamerService, AccountSnapshotService],
  exports: [OptionsGateway],
})
export class SchwabStreamingModule {}
