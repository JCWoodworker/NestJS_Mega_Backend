import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';

import { SchwabDailyPnl } from './entities/schwab-daily-pnl.entity';
import { SchwabRealizedTrade } from './entities/schwab-realized-trade.entity';
import { SchwabTransaction } from './entities/schwab-transaction.entity';
import { TransactionCategory } from './enums/transaction-category.enum';
import { etDateKey, etDayBounds } from './et-date.util';
import { computeTradingPnl } from './fifo-matcher.util';
import { transferSignedAmount } from './transaction-classify.util';

@Injectable()
export class DailyPnlService {
  private readonly logger = new Logger(DailyPnlService.name);

  constructor(
    @InjectRepository(SchwabDailyPnl)
    private readonly dailyRepository: Repository<SchwabDailyPnl>,
    @InjectRepository(SchwabTransaction)
    private readonly transactionRepository: Repository<SchwabTransaction>,
    @InjectRepository(SchwabRealizedTrade)
    private readonly realizedRepository: Repository<SchwabRealizedTrade>,
  ) {}

  /**
   * Upserts today's daily P&L row from a live equity sample.
   * Called from AccountSnapshotService's existing poll loop.
   */
  async recordEquitySample(
    accountHash: string,
    equity: number,
    dayStartEquity: number,
  ): Promise<void> {
    try {
      const date = etDateKey();
      const { start, end } = etDayBounds(date);

      const transfers = await this.transactionRepository.find({
        where: {
          accountHash,
          category: In([
            TransactionCategory.TRANSFER_IN,
            TransactionCategory.TRANSFER_OUT,
          ]),
          transactionDate: Between(start, end),
        },
      });
      const netTransfers = transfers.reduce(
        (sum, tx) =>
          sum + transferSignedAmount(tx.category, Number(tx.netAmount)),
        0,
      );

      const closedToday = await this.realizedRepository.find({
        where: {
          accountHash,
          closedAt: Between(start, end),
        },
      });
      const realizedPnl = closedToday.reduce(
        (sum, t) => sum + Number(t.realizedPnl),
        0,
      );

      const startEquity = Number(dayStartEquity) || Number(equity);
      const endEquity = Number(equity);
      const tradingPnl = computeTradingPnl(
        startEquity,
        endEquity,
        netTransfers,
      );

      const existing = await this.dailyRepository.findOne({
        where: { accountHash, date },
      });

      if (existing) {
        await this.dailyRepository.save({
          ...existing,
          startEquity,
          endEquity,
          netTransfers,
          tradingPnl,
          realizedPnl,
        });
      } else {
        await this.dailyRepository.save({
          accountHash,
          date,
          startEquity,
          endEquity,
          netTransfers,
          tradingPnl,
          realizedPnl,
        });
      }
    } catch (err) {
      this.logger.warn(
        `Failed to record equity sample for daily P&L: ${err.message}`,
      );
    }
  }
}
