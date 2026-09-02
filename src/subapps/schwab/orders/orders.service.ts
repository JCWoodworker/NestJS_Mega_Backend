import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

import { FastOrderDto } from './dto/fast-order.dto';
import { FlattenPositionDto } from './dto/flatten-position.dto';
import { ReversePositionDto } from './dto/reverse-position.dto';
import { OrderInstruction, OrderType } from './enums/order-instruction.enum';
import { applyMarketableLimitOffset } from './marketable-limit.util';

export interface OrderDispatchResult {
  status: 'SUBMITTED';
  statusCode: number;
  latencyMs: number;
  orderLocation: string | null;
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

    const executionPrice =
      dto.orderType === OrderType.LIMIT
        ? applyMarketableLimitOffset(
            dto.price,
            dto.instruction,
            dto.slippageTolerance,
          )
        : undefined;

    const payload = {
      orderType: dto.orderType,
      session: 'NORMAL',
      duration: 'DAY',
      orderStrategyType: 'SINGLE',
      ...(dto.orderType === OrderType.LIMIT && {
        price: executionPrice.toFixed(2),
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

      return {
        status: 'SUBMITTED',
        statusCode: response.status,
        latencyMs,
        orderLocation: response.headers['location'] ?? null,
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
}
