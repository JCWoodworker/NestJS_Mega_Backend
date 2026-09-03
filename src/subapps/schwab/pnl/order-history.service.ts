import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { OrderUpdate } from '@schwab/orders/working-order.mapper';

import { SchwabOrderHistory } from './entities/schwab-order-history.entity';
import { OrderSource } from './enums/order-source.enum';
import { OrderSourceTagService } from './order-source-tag.service';

const TERMINAL_STATUSES = new Set([
  'FILLED',
  'CANCELED',
  'CANCELLED',
  'REJECTED',
  'EXPIRED',
  'REPLACED',
]);

@Injectable()
export class OrderHistoryService {
  private readonly logger = new Logger(OrderHistoryService.name);

  constructor(
    @InjectRepository(SchwabOrderHistory)
    private readonly orderHistoryRepository: Repository<SchwabOrderHistory>,
    private readonly orderSourceTagService: OrderSourceTagService,
  ) {}

  isTerminalStatus(status: string): boolean {
    return TERMINAL_STATUSES.has((status ?? '').toUpperCase());
  }

  async upsertFromOrderUpdate(
    accountHash: string,
    update: OrderUpdate,
    enteredTime?: string | null,
  ): Promise<void> {
    if (!update.orderId || !this.isTerminalStatus(update.status)) return;

    try {
      const existing = await this.orderHistoryRepository.findOne({
        where: { accountHash, orderId: update.orderId },
      });
      const source =
        existing?.source ??
        (await this.orderSourceTagService.lookup(update.orderId));

      const payload: Partial<SchwabOrderHistory> = {
        accountHash,
        orderId: update.orderId,
        symbol: update.symbol ?? '',
        instruction: existing?.instruction ?? '',
        orderType: update.orderType ?? existing?.orderType ?? '',
        status: update.status,
        quantity: existing?.quantity ?? update.filledQuantity ?? 0,
        filledQuantity: update.filledQuantity ?? 0,
        price: update.price,
        stopPrice: update.stopPrice,
        averageFillPrice: update.averageFillPrice,
        enteredTime: enteredTime
          ? new Date(enteredTime)
          : existing?.enteredTime ?? null,
        closedAt: new Date(),
        source,
      };

      if (existing) {
        await this.orderHistoryRepository.save({ ...existing, ...payload });
      } else {
        await this.orderHistoryRepository.save(payload);
      }
    } catch (err) {
      this.logger.warn(
        `Failed to persist order history for ${update.orderId}: ${err.message}`,
      );
    }
  }

  /** Persist from a raw Schwab order (has instruction / quantity / enteredTime). */
  async upsertFromRawOrder(
    accountHash: string,
    rawOrder: any,
    update: OrderUpdate,
  ): Promise<void> {
    if (!update.orderId || !this.isTerminalStatus(update.status)) return;

    try {
      const leg = rawOrder?.orderLegCollection?.[0] ?? {};
      const existing = await this.orderHistoryRepository.findOne({
        where: { accountHash, orderId: update.orderId },
      });
      const source =
        existing?.source ??
        (await this.orderSourceTagService.lookup(update.orderId));

      const payload: Partial<SchwabOrderHistory> = {
        accountHash,
        orderId: update.orderId,
        symbol: update.symbol || leg.instrument?.symbol || '',
        instruction: leg.instruction ?? existing?.instruction ?? '',
        orderType: update.orderType ?? rawOrder?.orderType ?? '',
        status: update.status,
        quantity: Number(
          rawOrder?.quantity ?? leg.quantity ?? update.filledQuantity ?? 0,
        ),
        filledQuantity: update.filledQuantity ?? 0,
        price: update.price,
        stopPrice: update.stopPrice,
        averageFillPrice: update.averageFillPrice,
        enteredTime: rawOrder?.enteredTime
          ? new Date(rawOrder.enteredTime)
          : existing?.enteredTime ?? null,
        closedAt: new Date(),
        source,
      };

      if (existing) {
        await this.orderHistoryRepository.save({ ...existing, ...payload });
      } else {
        await this.orderHistoryRepository.save(payload);
      }
    } catch (err) {
      this.logger.warn(
        `Failed to persist order history for ${update.orderId}: ${err.message}`,
      );
    }
  }

  /** Direct write for paper / bot-simulated orders (no Schwab raw payload). */
  async upsertPaperOrder(params: {
    accountHash: string;
    orderId: string;
    symbol: string;
    instruction: string;
    orderType: string;
    status: string;
    quantity: number;
    filledQuantity: number;
    price: number | null;
    averageFillPrice: number | null;
    enteredTime: Date;
    closedAt: Date | null;
    source: OrderSource;
  }): Promise<void> {
    const existing = await this.orderHistoryRepository.findOne({
      where: { accountHash: params.accountHash, orderId: params.orderId },
    });
    const payload: Partial<SchwabOrderHistory> = {
      ...params,
      stopPrice: null,
    };
    if (existing) {
      await this.orderHistoryRepository.save({ ...existing, ...payload });
    } else {
      await this.orderHistoryRepository.save(payload);
    }
  }
}
