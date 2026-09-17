import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import schwabConfig from '@schwab/config/schwab.config';
import { OrdersModule } from '@schwab/orders/orders.module';

import { SchwabAccountResolver } from './schwab-account-resolver.service';
import { SchwabOwnerGuard } from './schwab-owner.guard';

/**
 * Cross-cutting Schwab helpers that nearly every other Schwab module needs.
 *
 * `forwardRef` on OrdersModule because the account resolver needs
 * `OrdersService.listAccounts()` while orders (and most other modules) need
 * the resolver — the same cycle the auth module already breaks this way.
 */
@Module({
  imports: [
    ConfigModule.forFeature(schwabConfig),
    forwardRef(() => OrdersModule),
  ],
  providers: [SchwabAccountResolver, SchwabOwnerGuard],
  exports: [SchwabAccountResolver, SchwabOwnerGuard],
})
export class SchwabSharedModule {}
