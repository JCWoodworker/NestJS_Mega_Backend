import {
  forwardRef,
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
import { SchwabAccountResolver } from '@schwab/shared/schwab-account-resolver.service';
import { runAsUser } from '@schwab/shared/schwab-user-context';

import { OptionsGateway } from './options.gateway';
import { SchwabStreamerPool } from './schwab-streamer-pool.service';

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
  private polling = false;
  /** `${accountHash}:${orderId}` -> fingerprint of the fields the frontend
   * cares about, from the previous successful poll. Keyed by account as well
   * as order because Schwab order ids are only unique within an account, so
   * a bare orderId key could suppress one user's update as a duplicate of
   * another user's. */
  private lastSeen = new Map<string, string>();

  constructor(
    private readonly ordersService: OrdersService,
    @Inject(forwardRef(() => OptionsGateway))
    private readonly optionsGateway: OptionsGateway,
    @Inject(forwardRef(() => SchwabStreamerPool))
    private readonly streamerPool: SchwabStreamerPool,
    private readonly accountResolver: SchwabAccountResolver,
    private readonly orderHistoryService: OrderHistoryService,
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
  ) {}

  onModuleInit(): void {
    this.scheduleNextTick();
  }

  onModuleDestroy(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
  }

  /** Same rate-budget reasoning as `AccountSnapshotService` — see the
   * `accountPollMinSpacingMs` config comment. */
  private scheduleNextTick(): void {
    const watchers = Math.max(1, this.streamerPool.activeUserIds().length);
    const spacing = Math.max(
      this.config.orderUpdatePollMs,
      watchers * this.config.accountPollMinSpacingMs,
    );
    this.pollTimer = setTimeout(() => {
      void this.pollAllWatchers().finally(() => this.scheduleNextTick());
    }, spacing);
  }

  private async pollAllWatchers(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      for (const userId of this.streamerPool.activeUserIds()) {
        await runAsUser(userId, () => this.pollAndEmit(userId));
      }
    } finally {
      this.polling = false;
    }
  }

  private async pollAndEmit(userId: string): Promise<void> {
    try {
      const accountHash = await this.accountResolver.resolve();
      const rawOrders = await this.ordersService.getRawOrders(accountHash);
      const asOf = Date.now();

      for (const rawOrder of rawOrders) {
        const update = mapOrderUpdate(rawOrder);
        if (!update.orderId) continue;

        const seenKey = `${accountHash}:${update.orderId}`;
        const fingerprint = orderUpdateFingerprint(update);
        if (this.lastSeen.get(seenKey) === fingerprint) continue;

        this.lastSeen.set(seenKey, fingerprint);
        this.optionsGateway.emitOrderUpdate(userId, {
          ...update,
          accountHash,
          asOf,
        });
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
          `Skipping order-update poll for user ${userId}: Schwab account not connected yet`,
        );
      } else {
        this.accountResolver.invalidate(userId);
        this.logger.warn(
          `Order-update poll failed for user ${userId}: ${message}`,
        );
      }
    }
  }
}
