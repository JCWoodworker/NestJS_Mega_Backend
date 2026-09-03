import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';

import { SchwabDailyPnl } from './entities/schwab-daily-pnl.entity';
import { SchwabRealizedTrade } from './entities/schwab-realized-trade.entity';
import { SchwabTransaction } from './entities/schwab-transaction.entity';
import { TransactionCategory } from './enums/transaction-category.enum';
import { etDateKey, etDayBounds, transferEtDateKey } from './et-date.util';
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
    const date = etDateKey();
    await this.upsertDayRow(accountHash, date, {
      equity: Number(equity),
      dayStartEquity: Number(dayStartEquity),
    });
  }

  /**
   * Recompute netTransfers / tradingPnl / realizedPnl for an ET calendar day.
   * Keeps existing start/end equity (used after MANUAL transfer
   * create/update/delete so the daily row updates immediately).
   */
  async recomputeDay(
    accountHash: string,
    dateKey: string = etDateKey(),
  ): Promise<void> {
    const existing = await this.dailyRepository.findOne({
      where: { accountHash, date: dateKey },
    });
    if (!existing) {
      return;
    }
    await this.upsertDayRow(accountHash, dateKey, {
      equity: Number(existing.endEquity),
      dayStartEquity: Number(existing.startEquity),
    });
  }

  private async upsertDayRow(
    accountHash: string,
    date: string,
    sample: { equity: number; dayStartEquity: number },
  ): Promise<void> {
    try {
      const { start, end } = etDayBounds(date);
      // Widen ±1 day so UTC-midnight MANUAL dates intended for this ET day
      // still load, then filter with transferEtDateKey (SCHWAB_SYNC + MANUAL).
      const windowStart = new Date(start.getTime() - 24 * 60 * 60 * 1000);
      const windowEnd = new Date(end.getTime() + 24 * 60 * 60 * 1000);

      const transferCandidates = await this.transactionRepository.find({
        where: {
          accountHash,
          category: In([
            TransactionCategory.TRANSFER_IN,
            TransactionCategory.TRANSFER_OUT,
          ]),
          transactionDate: Between(windowStart, windowEnd),
        },
      });
      const transfers = transferCandidates.filter(
        (tx) => transferEtDateKey(tx.transactionDate, tx.source) === date,
      );
      const netTransfers = transfers.reduce(
        (sum, tx) =>
          sum + transferSignedAmount(tx.category, Number(tx.netAmount)),
        0,
      );

      const closedCandidates = await this.realizedRepository.find({
        where: {
          accountHash,
          closedAt: Between(windowStart, windowEnd),
        },
      });
      const realizedPnl = closedCandidates
        .filter((t) => {
          const ms = t.closedAt.getTime();
          return ms >= start.getTime() && ms < end.getTime();
        })
        .reduce((sum, t) => sum + Number(t.realizedPnl), 0);

      const startEquity =
        Number(sample.dayStartEquity) || Number(sample.equity);
      const endEquity = Number(sample.equity);
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
        `Failed to upsert daily P&L for ${date}: ${err.message}`,
      );
    }
  }
}
