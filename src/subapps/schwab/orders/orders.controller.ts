import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { FastOrderDto } from './dto/fast-order.dto';
import { FlattenPositionDto } from './dto/flatten-position.dto';
import { ReversePositionDto } from './dto/reverse-position.dto';
import { OrdersService } from './orders.service';

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
}
