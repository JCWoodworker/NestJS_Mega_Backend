import { TransactionCategory } from './enums/transaction-category.enum';

/**
 * Maps Schwab's transaction `type` string into our ledger category so
 * transfers can be separated from trade P&L.
 *
 * ELECTRONIC_FUND is sign-dependent (positive = in, negative = out).
 * Unknown types fall through to OTHER.
 */
export function classifySchwabTransactionType(
  schwabType: string | null | undefined,
  netAmount = 0,
): TransactionCategory {
  const type = (schwabType ?? '').toUpperCase();

  switch (type) {
    case 'TRADE':
    case 'RECEIVE_AND_DELIVER':
      return TransactionCategory.TRADE;
    case 'ACH_RECEIPT':
    case 'CASH_RECEIPT':
    case 'WIRE_IN':
      return TransactionCategory.TRANSFER_IN;
    case 'ACH_DISBURSEMENT':
    case 'CASH_DISBURSEMENT':
    case 'WIRE_OUT':
      return TransactionCategory.TRANSFER_OUT;
    case 'ELECTRONIC_FUND':
      return netAmount >= 0
        ? TransactionCategory.TRANSFER_IN
        : TransactionCategory.TRANSFER_OUT;
    case 'DIVIDEND_OR_INTEREST':
      return TransactionCategory.INCOME;
    case 'JOURNAL':
    case 'MEMORANDUM':
    case 'MARGIN_CALL':
    case 'MONEY_MARKET':
    case 'SMA_ADJUSTMENT':
      return TransactionCategory.OTHER;
    default:
      return TransactionCategory.OTHER;
  }
}

/** Net capital movement: transfers in positive, transfers out negative. */
export function transferSignedAmount(
  category: TransactionCategory,
  netAmount: number,
): number {
  if (category === TransactionCategory.TRANSFER_IN) {
    return Math.abs(Number(netAmount));
  }
  if (category === TransactionCategory.TRANSFER_OUT) {
    return -Math.abs(Number(netAmount));
  }
  return 0;
}
