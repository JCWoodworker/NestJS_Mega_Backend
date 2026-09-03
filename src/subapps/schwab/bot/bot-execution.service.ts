import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import {
  OrderInstruction,
  OrderType,
} from '@schwab/orders/enums/order-instruction.enum';
import { OrdersService } from '@schwab/orders/orders.service';
import { SchwabTradeFill } from '@schwab/pnl/entities/schwab-trade-fill.entity';
import { FillAssetType } from '@schwab/pnl/enums/fill-asset-type.enum';
import { FillInstruction } from '@schwab/pnl/enums/fill-instruction.enum';
import { OrderSource } from '@schwab/pnl/enums/order-source.enum';
import { PositionEffect } from '@schwab/pnl/enums/position-effect.enum';
import { OrderHistoryService } from '@schwab/pnl/order-history.service';
import { OrderSourceTagService } from '@schwab/pnl/order-source-tag.service';
import { RealizedPnlService } from '@schwab/pnl/realized-pnl.service';

import { BotLane } from './enums/bot-lane.enum';

export interface EnterPositionParams {
  accountHash: string;
  lane: BotLane;
  symbol: string;
  quantity: number;
  /** Ask/mid quote used to seed the walk-limit entry (BOT_LIVE) or the sim fill (BOT_PAPER). */
  referenceAsk: number;
  referenceBid: number;
  paperSlippageCents: number;
  stopUnderlying: number | null;
  targetUnderlying: number | null;
}

export interface ExitPositionParams {
  accountHash: string;
  lane: BotLane;
  symbol: string;
  quantity: number;
  referenceBid: number;
  referenceAsk: number;
  paperSlippageCents: number;
}

export interface ExecutionResult {
  filled: boolean;
  fillPrice: number;
  orderId: string | null;
}

const WALK_LIMIT_ABANDON_MS = 10_000;
const WALK_LIMIT_STEP_MS = 2_000;

@Injectable()
export class BotExecutionService {
  private readonly logger = new Logger(BotExecutionService.name);

  constructor(
    private readonly ordersService: OrdersService,
    private readonly orderSourceTagService: OrderSourceTagService,
    private readonly orderHistoryService: OrderHistoryService,
    private readonly realizedPnlService: RealizedPnlService,
    @InjectRepository(SchwabTradeFill)
    private readonly fillRepository: Repository<SchwabTradeFill>,
  ) {}

  async enter(params: EnterPositionParams): Promise<ExecutionResult> {
    if (params.lane === BotLane.BOT_PAPER) {
      const fillPrice = params.referenceAsk + params.paperSlippageCents / 100;
      await this.recordPaperFill({
        accountHash: params.accountHash,
        symbol: params.symbol,
        instruction: FillInstruction.BUY,
        positionEffect: PositionEffect.OPENING,
        quantity: params.quantity,
        price: fillPrice,
        source: OrderSource.BOT_PAPER,
      });
      return { filled: true, fillPrice, orderId: null };
    }

    return this.walkLimitLive({
      accountHash: params.accountHash,
      symbol: params.symbol,
      instruction: OrderInstruction.BUY_TO_OPEN,
      quantity: params.quantity,
      startPrice: (params.referenceAsk + params.referenceBid) / 2,
      cappedPrice: params.referenceAsk,
      direction: 'up',
    });
  }

  async exit(params: ExitPositionParams): Promise<ExecutionResult> {
    if (params.lane === BotLane.BOT_PAPER) {
      const fillPrice = Math.max(
        0.01,
        params.referenceBid - params.paperSlippageCents / 100,
      );
      await this.recordPaperFill({
        accountHash: params.accountHash,
        symbol: params.symbol,
        instruction: FillInstruction.SELL,
        positionEffect: PositionEffect.CLOSING,
        quantity: params.quantity,
        price: fillPrice,
        source: OrderSource.BOT_PAPER,
      });
      await this.realizedPnlService.rebuildForAccount(params.accountHash);
      return { filled: true, fillPrice, orderId: null };
    }

    const result = await this.marketableStc({
      accountHash: params.accountHash,
      symbol: params.symbol,
      quantity: params.quantity,
      referenceBid: params.referenceBid,
    });
    await this.realizedPnlService.rebuildForAccount(params.accountHash);
    return result;
  }

  /** Idempotency guard: is there already a bot-tagged working order (optionally
   * scoped to a symbol) so the engine never double-enters mid walk-limit? */
  async hasBotWorkingOrder(
    accountHash: string,
    symbol?: string,
  ): Promise<boolean> {
    const working = await this.ordersService.getWorkingOrders(accountHash);
    const candidates = symbol
      ? working.filter((o) => o.symbol === symbol)
      : working;
    if (!candidates.length) return false;
    for (const order of candidates) {
      const source = await this.orderSourceTagService.lookup(order.orderId);
      if (source === OrderSource.BOT_LIVE) return true;
    }
    return false;
  }

  /** Cancels every currently-working bot-tagged order on the account. */
  async cancelBotWorkingOrders(accountHash: string): Promise<void> {
    const working = await this.ordersService.getWorkingOrders(accountHash);
    for (const order of working) {
      const source = await this.orderSourceTagService.lookup(order.orderId);
      if (source === OrderSource.BOT_LIVE) {
        try {
          await this.ordersService.cancelOrder(accountHash, order.orderId);
        } catch (err) {
          this.logger.warn(
            `Failed to cancel bot order ${order.orderId}: ${err.message}`,
          );
        }
      }
    }
  }

  private async walkLimitLive(params: {
    accountHash: string;
    symbol: string;
    instruction: OrderInstruction;
    quantity: number;
    startPrice: number;
    cappedPrice: number;
    direction: 'up' | 'down';
  }): Promise<ExecutionResult> {
    const deadline = Date.now() + WALK_LIMIT_ABANDON_MS;
    let currentPrice = round2(params.startPrice);
    let orderId: string | null = null;

    while (Date.now() < deadline) {
      if (orderId) {
        try {
          await this.ordersService.cancelOrder(params.accountHash, orderId);
        } catch {
          // Already filled/canceled — fall through to re-check below.
        }
      }

      const result = await this.ordersService.sendDirectOrder({
        accountHash: params.accountHash,
        symbol: params.symbol,
        instruction: params.instruction,
        quantity: params.quantity,
        orderType: OrderType.LIMIT,
        price: currentPrice,
      });
      orderId = result.orderId;
      if (orderId) {
        await this.orderSourceTagService.tag(
          orderId,
          params.accountHash,
          OrderSource.BOT_LIVE,
        );
      }

      await sleep(WALK_LIMIT_STEP_MS);

      if (orderId) {
        const working = await this.ordersService.getWorkingOrders(
          params.accountHash,
        );
        const stillWorking = working.some((o) => o.orderId === orderId);
        if (!stillWorking) {
          return { filled: true, fillPrice: currentPrice, orderId };
        }
      }

      currentPrice =
        params.direction === 'up'
          ? Math.min(params.cappedPrice, round2(currentPrice + 0.01))
          : Math.max(0.01, round2(currentPrice - 0.01));
    }

    if (orderId) {
      try {
        await this.ordersService.cancelOrder(params.accountHash, orderId);
      } catch {
        // ignore
      }
    }
    this.logger.warn(
      `Walk-limit entry abandoned for ${params.symbol} after ${WALK_LIMIT_ABANDON_MS}ms`,
    );
    return { filled: false, fillPrice: currentPrice, orderId };
  }

  private async marketableStc(params: {
    accountHash: string;
    symbol: string;
    quantity: number;
    referenceBid: number;
  }): Promise<ExecutionResult> {
    const price = Math.max(0.01, round2(params.referenceBid - 0.02));
    const result = await this.ordersService.sendDirectOrder({
      accountHash: params.accountHash,
      symbol: params.symbol,
      instruction: OrderInstruction.SELL_TO_CLOSE,
      quantity: params.quantity,
      orderType: OrderType.LIMIT,
      price,
    });
    if (result.orderId) {
      await this.orderSourceTagService.tag(
        result.orderId,
        params.accountHash,
        OrderSource.BOT_LIVE,
      );
    }
    return { filled: true, fillPrice: price, orderId: result.orderId };
  }

  private async recordPaperFill(params: {
    accountHash: string;
    symbol: string;
    instruction: FillInstruction;
    positionEffect: PositionEffect;
    quantity: number;
    price: number;
    source: OrderSource;
  }): Promise<void> {
    const orderId = `PAPER-${uuidv4()}`;
    const now = new Date();
    await this.fillRepository.save({
      accountHash: params.accountHash,
      schwabTransactionId: null,
      orderId,
      symbol: params.symbol,
      assetType: FillAssetType.OPTION,
      instruction: params.instruction,
      quantity: params.quantity,
      price: params.price,
      amount: params.price * params.quantity * 100,
      positionEffect: params.positionEffect,
      transactionDate: now,
      source: params.source,
    });

    await this.orderHistoryService.upsertPaperOrder({
      accountHash: params.accountHash,
      orderId,
      symbol: params.symbol,
      instruction:
        params.instruction === FillInstruction.BUY
          ? params.positionEffect === PositionEffect.OPENING
            ? 'BUY_TO_OPEN'
            : 'BUY_TO_CLOSE'
          : params.positionEffect === PositionEffect.CLOSING
            ? 'SELL_TO_CLOSE'
            : 'SELL_TO_OPEN',
      orderType: 'MARKET',
      status: 'FILLED',
      quantity: params.quantity,
      filledQuantity: params.quantity,
      price: params.price,
      averageFillPrice: params.price,
      enteredTime: now,
      closedAt: now,
      source: params.source,
    });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
