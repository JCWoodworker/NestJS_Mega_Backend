import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

import {
  mapAccountPositions,
  PositionSnapshot,
} from '@schwab/shared/account-data.mapper';

import { FastOrderDto } from './dto/fast-order.dto';
import { FlattenPositionDto } from './dto/flatten-position.dto';
import { ReversePositionDto } from './dto/reverse-position.dto';
import { OrderInstruction, OrderType } from './enums/order-instruction.enum';
import { applyMarketableLimitOffset } from './marketable-limit.util';
import { mapWorkingOrders, WorkingOrder } from './working-order.mapper';

export interface LinkedAccount {
  accountNumber: string;
  hashValue: string;
}

/** Statuses that represent a still-live order resting at the broker.
 * Schwab's `GET .../orders` only supports filtering by a single `status`
 * value, so "working" is computed client-side across the day's orders
 * instead — a resting STOP can sit in any of these before it fills. */
const OPEN_ORDER_STATUSES = new Set([
  'WORKING',
  'QUEUED',
  'PENDING_ACTIVATION',
  'ACCEPTED',
]);

/** Schwab's order-placement response has no body — the new order's id is only
 * available as the trailing path segment of the `Location` header, e.g.
 * `.../accounts/{hash}/orders/1003559649`. */
function extractOrderId(orderLocation: string | null): string | null {
  if (!orderLocation) return null;
  const match = orderLocation.match(/\/orders\/(\d+)\/?$/);
  return match?.[1] ?? null;
}

export interface OrderDispatchResult {
  status: 'SUBMITTED';
  statusCode: number;
  latencyMs: number;
  orderLocation: string | null;
  /** Schwab order id, parsed from the `Location` response header when present
   * (frontend contract section 10a — needed to cancel/replace without a
   * `GET /orders/working` round trip immediately after placing). */
  orderId: string | null;
}

/**
 * Direct, un-reviewed order dispatch: no preview/confirmation round trip.
 * Mirrors the doc's OrdersController/OrdersService almost verbatim,
 * adapted to this repo's HttpService/DI conventions.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly httpService: HttpService) {}

  async sendDirectOrder(dto: FastOrderDto): Promise<OrderDispatchResult> {
    const startTime = performance.now();

    // Marketable-limit walk only applies to plain LIMIT orders; STOP_LIMIT's
    // `price` is the resting limit leg once triggered, not a "fill me now"
    // price, so it's sent through unmodified.
    const executionPrice =
      dto.orderType === OrderType.LIMIT
        ? applyMarketableLimitOffset(
            dto.price,
            dto.instruction,
            dto.slippageTolerance,
          )
        : dto.price;

    const payload = {
      orderType: dto.orderType,
      session: 'NORMAL',
      duration: 'DAY',
      orderStrategyType: 'SINGLE',
      ...((dto.orderType === OrderType.LIMIT ||
        dto.orderType === OrderType.STOP_LIMIT) && {
        price: executionPrice.toFixed(2),
      }),
      ...((dto.orderType === OrderType.STOP ||
        dto.orderType === OrderType.STOP_LIMIT) && {
        stopPrice: dto.stopPrice.toFixed(2),
      }),
      orderLegCollection: [
        {
          instruction: dto.instruction,
          quantity: dto.quantity,
          instrument: {
            symbol: dto.symbol,
            assetType: 'OPTION',
          },
        },
      ],
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `/trader/v1/accounts/${dto.accountHash}/orders`,
          payload,
        ),
      );
      const latencyMs = Math.round(performance.now() - startTime);
      this.logger.log(`Order placed successfully in ${latencyMs}ms`);
      const orderLocation = response.headers['location'] ?? null;

      return {
        status: 'SUBMITTED',
        statusCode: response.status,
        latencyMs,
        orderLocation,
        orderId: extractOrderId(orderLocation),
      };
    } catch (error) {
      this.logger.error(
        'Order execution failed',
        error?.response?.data || error.message,
      );
      throw new BadRequestException(
        error?.response?.data?.message || 'Order dispatch failed',
      );
    }
  }

  async flattenPosition(dto: FlattenPositionDto): Promise<OrderDispatchResult> {
    return this.sendDirectOrder({
      accountHash: dto.accountHash,
      symbol: dto.symbol,
      instruction: OrderInstruction.SELL_TO_CLOSE,
      quantity: dto.quantity,
      orderType: OrderType.MARKET,
    });
  }

  async reversePosition(dto: ReversePositionDto): Promise<{
    status: 'REVERSED';
    closed: OrderDispatchResult;
    opened: OrderDispatchResult;
  }> {
    const closeOrder = this.sendDirectOrder({
      accountHash: dto.accountHash,
      symbol: dto.closeSymbol,
      instruction: OrderInstruction.SELL_TO_CLOSE,
      quantity: dto.quantity,
      orderType: OrderType.MARKET,
    });
    const openOrder = this.sendDirectOrder({
      accountHash: dto.accountHash,
      symbol: dto.openSymbol,
      instruction: OrderInstruction.BUY_TO_OPEN,
      quantity: dto.quantity,
      orderType: OrderType.MARKET,
    });

    const [closed, opened] = await Promise.all([closeOrder, openOrder]);
    return { status: 'REVERSED', closed, opened };
  }

  /** Lists Schwab account numbers linked to this app + their hash values
   * (the opaque `accountHash` every order/position endpoint expects), so
   * the frontend doesn't have to hardcode `SCHWAB_ACCOUNT_HASH`. */
  async listAccounts(): Promise<LinkedAccount[]> {
    const response = await firstValueFrom(
      this.httpService.get('/trader/v1/accounts/accountNumbers'),
    );
    return response.data ?? [];
  }

  async getPositions(accountHash: string): Promise<PositionSnapshot[]> {
    const response = await firstValueFrom(
      this.httpService.get(`/trader/v1/accounts/${accountHash}`, {
        params: { fields: 'positions' },
      }),
    );
    return mapAccountPositions(response.data);
  }

  /** Raw Schwab orders for "today so far" — Schwab requires an explicit
   * `fromEnteredTime`/`toEnteredTime` window on this endpoint, so this
   * always looks back to local midnight, which covers every 0DTE order.
   * Shared by `getWorkingOrders` (section 10b) and the order-update poller
   * (section 10d), which also needs terminal statuses (FILLED/CANCELED) to
   * detect fills, not just still-open orders. */
  async getRawOrders(accountHash: string): Promise<any[]> {
    const fromEnteredTime = new Date();
    fromEnteredTime.setHours(0, 0, 0, 0);

    const response = await firstValueFrom(
      this.httpService.get(`/trader/v1/accounts/${accountHash}/orders`, {
        params: {
          maxResults: 200,
          fromEnteredTime: fromEnteredTime.toISOString(),
          toEnteredTime: new Date().toISOString(),
        },
      }),
    );
    return response.data ?? [];
  }

  /** `GET /orders/working` (frontend contract section 10b) — resting orders
   * only, so the chart can redraw stop-price lines after a page refresh. */
  async getWorkingOrders(accountHash: string): Promise<WorkingOrder[]> {
    const rawOrders = await this.getRawOrders(accountHash);
    return mapWorkingOrders(rawOrders).filter((order) =>
      OPEN_ORDER_STATUSES.has(order.status),
    );
  }

  /** `DELETE /orders/:orderId` (section 10c) — cancels a resting order, e.g.
   * the prior stop when trailing (cancel + re-place via `fast-execute`). */
  async cancelOrder(
    accountHash: string,
    orderId: string,
  ): Promise<{ status: 'CANCELED'; statusCode: number }> {
    try {
      const response = await firstValueFrom(
        this.httpService.delete(
          `/trader/v1/accounts/${accountHash}/orders/${orderId}`,
        ),
      );
      return { status: 'CANCELED', statusCode: response.status };
    } catch (error) {
      this.logger.error(
        'Order cancel failed',
        error?.response?.data || error.message,
      );
      throw new BadRequestException(
        error?.response?.data?.message || 'Order cancel failed',
      );
    }
  }
}
