import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';

import schwabConfig from '@schwab/config/schwab.config';
import { OrdersService } from '@schwab/orders/orders.service';

import { SchwabTradeFill } from './entities/schwab-trade-fill.entity';
import { SchwabTransaction } from './entities/schwab-transaction.entity';
import { TransactionSource } from './enums/transaction-source.enum';
import { RealizedPnlService } from './realized-pnl.service';
import { mapSchwabTransaction } from './schwab-transaction.mapper';

/** Schwab types we sync. The `types` query param is required by the API and
 * accepts one value per request, so we loop. */
const SCHWAB_TRANSACTION_TYPES = [
  'TRADE',
  'RECEIVE_AND_DELIVER',
  'DIVIDEND_OR_INTEREST',
  'ACH_RECEIPT',
  'ACH_DISBURSEMENT',
  'CASH_RECEIPT',
  'CASH_DISBURSEMENT',
  'ELECTRONIC_FUND',
  'WIRE_IN',
  'WIRE_OUT',
  'JOURNAL',
  'MEMORANDUM',
  'MARGIN_CALL',
  'MONEY_MARKET',
  'SMA_ADJUSTMENT',
] as const;

@Injectable()
export class TransactionSyncService implements OnModuleInit {
  private readonly logger = new Logger(TransactionSyncService.name);
  private cachedAccountHash: string | null = null;
  private syncing = false;

  constructor(
    private readonly httpService: HttpService,
    private readonly ordersService: OrdersService,
    private readonly realizedPnlService: RealizedPnlService,
    @InjectRepository(SchwabTransaction)
    private readonly transactionRepository: Repository<SchwabTransaction>,
    @InjectRepository(SchwabTradeFill)
    private readonly fillRepository: Repository<SchwabTradeFill>,
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
  ) {}

  onModuleInit(): void {
    // Fire-and-forget initial sync so history is available shortly after boot.
    setTimeout(() => void this.syncRecent(), 15_000);
  }

  @Cron('0 */15 * * * *')
  async cronSync(): Promise<void> {
    await this.syncRecent();
  }

  async syncRecent(lookbackDays = 30): Promise<void> {
    if (this.syncing) {
      this.logger.debug('Transaction sync already in progress; skipping');
      return;
    }
    this.syncing = true;
    try {
      const accountHash = await this.resolveAccountHash();
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - lookbackDays);

      let upserted = 0;
      for (const type of SCHWAB_TRANSACTION_TYPES) {
        const rows = await this.fetchTransactions(
          accountHash,
          type,
          startDate,
          endDate,
        );
        for (const raw of rows) {
          const mapped = mapSchwabTransaction(raw);
          if (!mapped.schwabTransactionId) continue;

          const existing = await this.transactionRepository.findOne({
            where: {
              accountHash,
              schwabTransactionId: mapped.schwabTransactionId,
            },
          });

          if (existing) {
            await this.transactionRepository.save({
              ...existing,
              category: mapped.category,
              schwabType: mapped.schwabType,
              netAmount: mapped.netAmount,
              symbol: mapped.symbol,
              description: mapped.description,
              transactionDate: mapped.transactionDate,
              raw: mapped.raw,
            });
          } else {
            await this.transactionRepository.save({
              accountHash,
              schwabTransactionId: mapped.schwabTransactionId,
              category: mapped.category,
              schwabType: mapped.schwabType,
              source: TransactionSource.SCHWAB_SYNC,
              netAmount: mapped.netAmount,
              symbol: mapped.symbol,
              description: mapped.description,
              transactionDate: mapped.transactionDate,
              raw: mapped.raw,
              note: null,
            });
          }
          upserted += 1;

          // Replace fills for this transaction id so re-sync stays idempotent.
          await this.fillRepository.delete({
            accountHash,
            schwabTransactionId: mapped.schwabTransactionId,
          });
          if (mapped.fills.length) {
            await this.fillRepository.save(
              mapped.fills.map((fill) => ({
                accountHash,
                schwabTransactionId: fill.schwabTransactionId,
                orderId: fill.orderId,
                symbol: fill.symbol,
                assetType: fill.assetType,
                instruction: fill.instruction,
                quantity: fill.quantity,
                price: fill.price,
                amount: fill.amount,
                positionEffect: fill.positionEffect,
                transactionDate: fill.transactionDate,
              })),
            );
          }
        }
      }

      await this.realizedPnlService.rebuildForAccount(accountHash);
      this.logger.log(
        `Transaction sync complete for ${accountHash}: upserted=${upserted}`,
      );
    } catch (err) {
      const message = err?.response?.data?.message || err.message;
      if (message?.includes('not connected')) {
        this.logger.debug(
          'Skipping transaction sync: Schwab account not connected yet',
        );
      } else {
        this.cachedAccountHash = null;
        this.logger.warn(`Transaction sync failed: ${message}`);
      }
    } finally {
      this.syncing = false;
    }
  }

  private async fetchTransactions(
    accountHash: string,
    type: string,
    startDate: Date,
    endDate: Date,
  ): Promise<any[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `/trader/v1/accounts/${accountHash}/transactions`,
          {
            params: {
              // Schwab docs use `types` (plural) as a single enum value per call.
              types: type,
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
            },
          },
        ),
      );
      return Array.isArray(response.data) ? response.data : [];
    } catch (err) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      // Some types return 400 when empty / unsupported for the account —
      // treat as empty rather than aborting the whole sync, but log so we
      // can tell "API rejected the query" from "account truly has no rows."
      if (status === 400 || status === 404) {
        this.logger.warn(
          `Schwab transactions type=${type} returned ${status}: ${JSON.stringify(
            body,
          )}`,
        );
        return [];
      }
      throw err;
    }
  }

  private async resolveAccountHash(): Promise<string> {
    if (this.config.accountHash) return this.config.accountHash;
    if (this.cachedAccountHash) return this.cachedAccountHash;

    const accounts = await this.ordersService.listAccounts();
    if (!accounts.length) {
      throw new Error('No Schwab accounts linked to this app yet');
    }
    this.cachedAccountHash = accounts[0].hashValue;
    return this.cachedAccountHash;
  }
}
