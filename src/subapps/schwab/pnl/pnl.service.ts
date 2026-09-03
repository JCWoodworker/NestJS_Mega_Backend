import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsWhere,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';

import schwabConfig from '@schwab/config/schwab.config';
import { OrdersService } from '@schwab/orders/orders.service';

import { DailyPnlService } from './daily-pnl.service';
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
import { SchwabDailyPnl } from './entities/schwab-daily-pnl.entity';
import { SchwabOrderHistory } from './entities/schwab-order-history.entity';
import { SchwabRealizedTrade } from './entities/schwab-realized-trade.entity';
import { SchwabTransaction } from './entities/schwab-transaction.entity';
import { TransactionCategory } from './enums/transaction-category.enum';
import { TransactionSource } from './enums/transaction-source.enum';
import {
  etDateKey,
  parseEtCalendarDate,
  transferEtDateKey,
} from './et-date.util';
import { transferSignedAmount } from './transaction-classify.util';
import { TransactionSyncService } from './transaction-sync.service';

@Injectable()
export class PnlService {
  private cachedAccountHash: string | null = null;

  constructor(
    private readonly ordersService: OrdersService,
    private readonly transactionSyncService: TransactionSyncService,
    private readonly dailyPnlService: DailyPnlService,
    @InjectRepository(SchwabDailyPnl)
    private readonly dailyRepository: Repository<SchwabDailyPnl>,
    @InjectRepository(SchwabTransaction)
    private readonly transactionRepository: Repository<SchwabTransaction>,
    @InjectRepository(SchwabRealizedTrade)
    private readonly realizedRepository: Repository<SchwabRealizedTrade>,
    @InjectRepository(SchwabOrderHistory)
    private readonly orderHistoryRepository: Repository<SchwabOrderHistory>,
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
  ) {}

  async getDaily(query: PnlDateRangeQueryDto) {
    const accountHash = await this.resolveAccountHash(query.accountHash);
    const where: FindOptionsWhere<SchwabDailyPnl> = { accountHash };
    if (query.from && query.to) {
      where.date = Between(
        query.from.slice(0, 10),
        query.to.slice(0, 10),
      ) as any;
    } else if (query.from) {
      where.date = MoreThanOrEqual(query.from.slice(0, 10)) as any;
    } else if (query.to) {
      where.date = LessThanOrEqual(query.to.slice(0, 10)) as any;
    }

    const rows = await this.dailyRepository.find({
      where,
      order: { date: 'ASC' },
    });

    return rows.map((row) => ({
      date: row.date,
      startEquity: Number(row.startEquity),
      endEquity: Number(row.endEquity),
      netTransfers: Number(row.netTransfers),
      tradingPnl: Number(row.tradingPnl),
      realizedPnl: Number(row.realizedPnl),
    }));
  }

  async getSummary(accountHashParam?: string) {
    const accountHash = await this.resolveAccountHash(accountHashParam);
    const today = etDateKey();

    const transfers = await this.transactionRepository.find({
      where: [
        { accountHash, category: TransactionCategory.TRANSFER_IN },
        { accountHash, category: TransactionCategory.TRANSFER_OUT },
      ],
    });

    let totalTransfersIn = 0;
    let totalTransfersOut = 0;
    for (const tx of transfers) {
      const signed = transferSignedAmount(tx.category, Number(tx.netAmount));
      if (signed >= 0) totalTransfersIn += signed;
      else totalTransfersOut += Math.abs(signed);
    }
    const netDeposits = totalTransfersIn - totalTransfersOut;

    const todayRow = await this.dailyRepository.findOne({
      where: { accountHash, date: today },
    });
    const latestRow = await this.dailyRepository.findOne({
      where: { accountHash },
      order: { date: 'DESC' },
    });

    const currentEquity = latestRow ? Number(latestRow.endEquity) : 0;
    const todayPnl = todayRow ? Number(todayRow.tradingPnl) : 0;
    const allTimeTradingPnl = currentEquity - netDeposits;

    return {
      currentEquity,
      totalTransfersIn,
      totalTransfersOut,
      netDeposits,
      allTimeTradingPnl,
      todayPnl,
      asOfDate: latestRow?.date ?? today,
    };
  }

  async getTransactions(query: PnlTransactionsQueryDto) {
    const accountHash = await this.resolveAccountHash(query.accountHash);
    const where: FindOptionsWhere<SchwabTransaction> = { accountHash };
    if (query.category) where.category = query.category;
    if (query.from || query.to) {
      where.transactionDate = this.dateRange(query.from, query.to) as any;
    }

    const rows = await this.transactionRepository.find({
      where,
      order: { transactionDate: 'DESC' },
      take: 500,
    });

    return rows.map((row) => ({
      id: row.id,
      category: row.category,
      schwabType: row.schwabType,
      source: row.source,
      netAmount: Number(row.netAmount),
      symbol: row.symbol,
      description: row.description,
      transactionDate: row.transactionDate.toISOString(),
      note: row.note,
    }));
  }

  async createManualTransaction(dto: CreateManualTransactionDto) {
    const accountHash = await this.resolveAccountHash(dto.accountHash);
    const transactionDate = parseEtCalendarDate(dto.date);
    const row = await this.transactionRepository.save({
      accountHash,
      schwabTransactionId: null,
      category: dto.category,
      schwabType: null,
      source: TransactionSource.MANUAL,
      netAmount: dto.amount,
      symbol: dto.symbol ?? null,
      description: dto.description ?? null,
      transactionDate,
      raw: null,
      note: dto.note ?? null,
    });

    await this.refreshDailyForTransfer(accountHash, transactionDate);

    return {
      id: row.id,
      category: row.category,
      source: row.source,
      netAmount: Number(row.netAmount),
      transactionDate: row.transactionDate.toISOString(),
      note: row.note,
    };
  }

  async updateManualTransaction(id: string, dto: UpdateManualTransactionDto) {
    const row = await this.transactionRepository.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Transaction not found');
    if (row.source !== TransactionSource.MANUAL) {
      throw new BadRequestException('Only MANUAL transactions can be edited');
    }

    const previousDate = row.transactionDate;

    if (dto.category !== undefined) row.category = dto.category;
    if (dto.amount !== undefined) row.netAmount = dto.amount;
    if (dto.date !== undefined) {
      row.transactionDate = parseEtCalendarDate(dto.date);
    }
    if (dto.note !== undefined) row.note = dto.note;
    if (dto.symbol !== undefined) row.symbol = dto.symbol;
    if (dto.description !== undefined) row.description = dto.description;

    const saved = await this.transactionRepository.save(row);

    await this.refreshDailyForTransfer(row.accountHash, previousDate);
    await this.refreshDailyForTransfer(row.accountHash, saved.transactionDate);

    return {
      id: saved.id,
      category: saved.category,
      source: saved.source,
      netAmount: Number(saved.netAmount),
      transactionDate: saved.transactionDate.toISOString(),
      note: saved.note,
    };
  }

  async deleteManualTransaction(id: string) {
    const row = await this.transactionRepository.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Transaction not found');
    if (row.source !== TransactionSource.MANUAL) {
      throw new BadRequestException('Only MANUAL transactions can be deleted');
    }
    await this.transactionRepository.delete({ id });
    await this.refreshDailyForTransfer(row.accountHash, row.transactionDate);
    return { deleted: true, id };
  }

  async getTrades(query: PnlTradesQueryDto) {
    const accountHash = await this.resolveAccountHash(query.accountHash);
    const where: FindOptionsWhere<SchwabRealizedTrade> = { accountHash };
    if (query.symbol) where.symbol = query.symbol;
    if (query.source?.length) where.source = In(query.source) as any;
    if (query.from || query.to) {
      where.closedAt = this.dateRange(query.from, query.to) as any;
    }

    const rows = await this.realizedRepository.find({
      where,
      order: { closedAt: 'DESC' },
      take: 500,
    });

    return rows.map((row) => ({
      id: row.id,
      symbol: row.symbol,
      direction: row.direction,
      quantity: Number(row.quantity),
      openPrice: Number(row.openPrice),
      closePrice: Number(row.closePrice),
      openedAt: row.openedAt.toISOString(),
      closedAt: row.closedAt.toISOString(),
      realizedPnl: Number(row.realizedPnl),
      holdingMs: row.closedAt.getTime() - row.openedAt.getTime(),
      source: row.source,
    }));
  }

  async getOrders(query: PnlOrdersQueryDto) {
    const accountHash = await this.resolveAccountHash(query.accountHash);
    const where: FindOptionsWhere<SchwabOrderHistory> = { accountHash };
    if (query.symbol) where.symbol = query.symbol;
    if (query.status) where.status = query.status;
    if (query.source?.length) where.source = In(query.source) as any;
    if (query.from || query.to) {
      where.enteredTime = this.dateRange(query.from, query.to) as any;
    }

    const rows = await this.orderHistoryRepository.find({
      where,
      order: { enteredTime: 'DESC' },
      take: 500,
    });

    return rows.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      symbol: row.symbol,
      instruction: row.instruction,
      orderType: row.orderType,
      status: row.status,
      quantity: Number(row.quantity),
      filledQuantity: Number(row.filledQuantity),
      price: row.price != null ? Number(row.price) : null,
      stopPrice: row.stopPrice != null ? Number(row.stopPrice) : null,
      averageFillPrice:
        row.averageFillPrice != null ? Number(row.averageFillPrice) : null,
      enteredTime: row.enteredTime?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      source: row.source,
    }));
  }

  /** Manual trigger for ops / after reconnect. */
  async triggerSync(): Promise<{ ok: true }> {
    await this.transactionSyncService.syncRecent();
    return { ok: true };
  }

  private async refreshDailyForTransfer(
    accountHash: string,
    transactionDate: Date,
  ): Promise<void> {
    const dayKey = transferEtDateKey(transactionDate, TransactionSource.MANUAL);
    await this.dailyPnlService.recomputeDay(accountHash, dayKey);
    // Also refresh "today" in case the transfer was meant for today but the
    // stored timestamp keyed a neighboring day before normalization.
    const today = etDateKey();
    if (dayKey !== today) {
      await this.dailyPnlService.recomputeDay(accountHash, today);
    }
  }

  private dateRange(from?: string, to?: string) {
    if (from && to) {
      return Between(new Date(from), new Date(to));
    }
    if (from) return MoreThanOrEqual(new Date(from));
    if (to) return LessThanOrEqual(new Date(to));
    return undefined;
  }

  private async resolveAccountHash(override?: string): Promise<string> {
    if (override) return override;
    if (this.config.accountHash) return this.config.accountHash;
    if (this.cachedAccountHash) return this.cachedAccountHash;

    const accounts = await this.ordersService.listAccounts();
    if (!accounts.length) {
      throw new BadRequestException(
        'No Schwab accounts linked to this app yet',
      );
    }
    this.cachedAccountHash = accounts[0].hashValue;
    return this.cachedAccountHash;
  }
}
