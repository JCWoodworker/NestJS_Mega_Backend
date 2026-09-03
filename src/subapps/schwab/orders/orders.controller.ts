import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { FastOrderDto } from './dto/fast-order.dto';
import { FlattenPositionDto } from './dto/flatten-position.dto';
import { ReversePositionDto } from './dto/reverse-position.dto';
import { OrdersService } from './orders.service';

/**
 * Overrides this app's global default rate limit (10 req/60s, from the
 * `ThrottlerModule` APP_GUARD in `ScrapersModule`) to match the 120
 * orders/min per-account limit approved for this app in the Schwab
 * Developer Portal - the global default would otherwise throttle a
 * scalping workflow almost immediately. Schwab enforces its own 120/min
 * cap upstream regardless; this just keeps our own guard from being
 * stricter than that for no reason.
 */
@Throttle({ default: { limit: 120, ttl: 60000 } })
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('fast-execute')
  @HttpCode(HttpStatus.OK)
  async executeFastOrder(@Body() dto: FastOrderDto) {
    return this.ordersService.sendDirectOrder(dto);
  }

  @Post('flatten')
  @HttpCode(HttpStatus.OK)
  async flattenPosition(@Body() dto: FlattenPositionDto) {
    return this.ordersService.flattenPosition(dto);
  }

  @Post('reverse')
  @HttpCode(HttpStatus.OK)
  async reversePosition(@Body() dto: ReversePositionDto) {
    return this.ordersService.reversePosition(dto);
  }

  /** Lists Schwab account numbers linked to this app + their `hashValue`
   * (the opaque `accountHash` every order/position endpoint expects). */
  @Get('accounts')
  async listAccounts() {
    return this.ordersService.listAccounts();
  }

  @Get('positions')
  async getPositions(@Query('accountHash') accountHash: string) {
    return this.ordersService.getPositions(accountHash);
  }

  /** Resting orders (frontend contract section 10b) — lets the chart redraw
   * stop-price lines for the tracked OSI after a page refresh. */
  @Get('working')
  async getWorkingOrders(@Query('accountHash') accountHash: string) {
    return this.ordersService.getWorkingOrders(accountHash);
  }

  /** Cancels a resting order (section 10c). Trailing a stop is cancel +
   * re-place via `fast-execute` with the new `stopPrice` — no separate
   * replace endpoint, per the doc's "cancel+re-place is enough for v1". */
  @Delete(':orderId')
  @HttpCode(HttpStatus.OK)
  async cancelOrder(
    @Param('orderId') orderId: string,
    @Query('accountHash') accountHash: string,
  ) {
    return this.ordersService.cancelOrder(accountHash, orderId);
  }
}
