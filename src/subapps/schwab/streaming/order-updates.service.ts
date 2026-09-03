import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import schwabConfig from '@schwab/config/schwab.config';
import { OrdersService } from '@schwab/orders/orders.service';
import {
  mapOrderUpdate,
  orderUpdateFingerprint,
} from '@schwab/orders/working-order.mapper';
import { OrderHistoryService } from '@schwab/pnl/order-history.service';

import { OptionsGateway } from './options.gateway';

/**
 * Optional but high-value addition from the frontend's contract ask (section
 * 10d): polls Schwab's orders endpoint (already fetched for
 * `GET /orders/working`) and diffs against the previous poll so the chart
 * can flip entry→closed and clear stop lines on a fill/cancel without
 * itself polling `GET /orders/working`. Mirrors `AccountSnapshotService`'s
 * poll-and-cache-accountHash shape rather than sharing it directly, since
 * the two poll on independent cadences and either one failing shouldn't
 * affect the other.
 */
@Injectable()
export class OrderUpdatesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderUpdatesService.name);
  private pollTimer: NodeJS.Timeout | null = null;
  private cachedAccountHash: string | null = null;
  /** orderId -> fingerprint of the fields the frontend cares about, from the
   * previous successful poll. */
  private lastSeen = new Map<string, string>();

  constructor(
    private readonly ordersService: OrdersService,
    private readonly optionsGateway: OptionsGateway,
    private readonly orderHistoryService: OrderHistoryService,
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
  ) {}

  onModuleInit(): void {
    this.pollTimer = setInterval(
      () => void this.pollAndBroadcast(),
      this.config.orderUpdatePollMs,
    );
  }

  onModuleDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  private async resolveAccountHash(): Promise<string> {
    if (this.config.accountHash) return this.config.accountHash;
    if (this.cachedAccountHash) return this.cachedAccountHash;

    const accounts = await this.ordersService.listAccounts();
    if (!accounts.length) {
      throw new Error('No Schwab accounts linked to this app yet');
    }
    this.cachedAccountHash = accounts[0].hashValue;
    return this.cachedAccountHash;
  }

  private async pollAndBroadcast(): Promise<void> {
    try {
      const accountHash = await this.resolveAccountHash();
      const rawOrders = await this.ordersService.getRawOrders(accountHash);
      const asOf = Date.now();

      for (const rawOrder of rawOrders) {
        const update = mapOrderUpdate(rawOrder);
        if (!update.orderId) continue;

        const fingerprint = orderUpdateFingerprint(update);
        if (this.lastSeen.get(update.orderId) === fingerprint) continue;

        this.lastSeen.set(update.orderId, fingerprint);
        this.optionsGateway.emitOrderUpdate({ ...update, accountHash, asOf });
        void this.orderHistoryService.upsertFromRawOrder(
          accountHash,
          rawOrder,
          update,
        );
      }
    } catch (err) {
      const message = err?.response?.data?.message || err.message;
      if (message?.includes('not connected')) {
        this.logger.debug(
          'Skipping order-update poll: Schwab account not connected yet',
        );
      } else {
        this.cachedAccountHash = null;
        this.logger.warn(`Order-update poll failed: ${message}`);
      }
    }
  }
}
