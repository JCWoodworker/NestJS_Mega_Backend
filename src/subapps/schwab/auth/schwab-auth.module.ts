import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import schwabConfig from '@schwab/config/schwab.config';
import {
  SCHWAB_HTTP_TIMEOUT_MS,
  schwabHttpsAgent,
} from '@schwab/http/schwab-https-agent';
import { OrdersModule } from '@schwab/orders/orders.module';

import { SchwabToken } from './entities/schwab-token.entity';
import { SchwabAuthController } from './schwab-auth.controller';
import { SchwabAuthService } from './schwab-auth.service';

@Module({
  imports: [
    ConfigModule.forFeature(schwabConfig),
    TypeOrmModule.forFeature([SchwabToken]),
    // Plain client (no baseURL/interceptor): token exchange/refresh calls
    // use Basic auth against an absolute tokenUrl, not a Bearer token.
    HttpModule.register({
      timeout: SCHWAB_HTTP_TIMEOUT_MS,
      httpsAgent: schwabHttpsAgent,
    }),
    // Cycle: SchwabAuthModule -> OrdersModule -> SchwabHttpModule ->
    // SchwabAuthModule (for the Bearer interceptor). forwardRef breaks it.
    forwardRef(() => OrdersModule),
  ],
  controllers: [SchwabAuthController],
  providers: [SchwabAuthService],
  exports: [SchwabAuthService],
})
export class SchwabAuthModule {}
