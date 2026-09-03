import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import {
  CreateManualTransactionDto,
  UpdateManualTransactionDto,
} from './dto/manual-transaction.dto';
import {
  PnlDateRangeQueryDto,
  PnlOrdersQueryDto,
  PnlTradesQueryDto,
  PnlTransactionsQueryDto,
} from './dto/pnl-query.dto';
import { PnlService } from './pnl.service';

/**
 * Daily P&L / trade history / transfer ledger for the frontend history page.
 * JWT-authenticated like `/orders/*` and `/market-data/*`.
 */
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('pnl')
export class PnlController {
  constructor(private readonly pnlService: PnlService) {}

  @Get('daily')
  async getDaily(@Query() query: PnlDateRangeQueryDto) {
    return this.pnlService.getDaily(query);
  }

  @Get('summary')
  async getSummary(@Query('accountHash') accountHash?: string) {
    return this.pnlService.getSummary(accountHash);
  }

  @Get('transactions')
  async getTransactions(@Query() query: PnlTransactionsQueryDto) {
    return this.pnlService.getTransactions(query);
  }

  @Post('transactions')
  @HttpCode(HttpStatus.CREATED)
  async createManualTransaction(@Body() dto: CreateManualTransactionDto) {
    return this.pnlService.createManualTransaction(dto);
  }

  @Patch('transactions/:id')
  async updateManualTransaction(
    @Param('id') id: string,
    @Body() dto: UpdateManualTransactionDto,
  ) {
    return this.pnlService.updateManualTransaction(id, dto);
  }

  @Delete('transactions/:id')
  async deleteManualTransaction(@Param('id') id: string) {
    return this.pnlService.deleteManualTransaction(id);
  }

  @Get('trades')
  async getTrades(@Query() query: PnlTradesQueryDto) {
    return this.pnlService.getTrades(query);
  }

  @Get('orders')
  async getOrders(@Query() query: PnlOrdersQueryDto) {
    return this.pnlService.getOrders(query);
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async triggerSync() {
    return this.pnlService.triggerSync();
  }
}
