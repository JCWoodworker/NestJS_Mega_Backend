import { TransactionCategory } from './enums/transaction-category.enum';
import {
  classifySchwabTransactionType,
  transferSignedAmount,
} from './transaction-classify.util';

describe('classifySchwabTransactionType', () => {
  it('maps trade types to TRADE', () => {
    expect(classifySchwabTransactionType('TRADE')).toBe(
      TransactionCategory.TRADE,
    );
    expect(classifySchwabTransactionType('RECEIVE_AND_DELIVER')).toBe(
      TransactionCategory.TRADE,
    );
  });

  it('maps inbound transfer types to TRANSFER_IN', () => {
    expect(classifySchwabTransactionType('ACH_RECEIPT')).toBe(
      TransactionCategory.TRANSFER_IN,
    );
    expect(classifySchwabTransactionType('WIRE_IN')).toBe(
      TransactionCategory.TRANSFER_IN,
    );
    expect(classifySchwabTransactionType('CASH_RECEIPT')).toBe(
      TransactionCategory.TRANSFER_IN,
    );
  });

  it('maps outbound transfer types to TRANSFER_OUT', () => {
    expect(classifySchwabTransactionType('ACH_DISBURSEMENT')).toBe(
      TransactionCategory.TRANSFER_OUT,
    );
    expect(classifySchwabTransactionType('WIRE_OUT')).toBe(
      TransactionCategory.TRANSFER_OUT,
    );
  });

  it('classifies ELECTRONIC_FUND by sign', () => {
    expect(classifySchwabTransactionType('ELECTRONIC_FUND', 500)).toBe(
      TransactionCategory.TRANSFER_IN,
    );
    expect(classifySchwabTransactionType('ELECTRONIC_FUND', -200)).toBe(
      TransactionCategory.TRANSFER_OUT,
    );
  });

  it('maps dividends to INCOME and unknown to OTHER', () => {
    expect(classifySchwabTransactionType('DIVIDEND_OR_INTEREST')).toBe(
      TransactionCategory.INCOME,
    );
    expect(classifySchwabTransactionType('SOMETHING_NEW')).toBe(
      TransactionCategory.OTHER,
    );
  });
});

describe('transferSignedAmount', () => {
  it('returns positive for TRANSFER_IN and negative for TRANSFER_OUT', () => {
    expect(transferSignedAmount(TransactionCategory.TRANSFER_IN, -1000)).toBe(
      1000,
    );
    expect(transferSignedAmount(TransactionCategory.TRANSFER_OUT, 250)).toBe(
      -250,
    );
    expect(transferSignedAmount(TransactionCategory.TRADE, 50)).toBe(0);
  });
});
