import { FillAssetType } from './enums/fill-asset-type.enum';
import { FillInstruction } from './enums/fill-instruction.enum';
import { PositionEffect } from './enums/position-effect.enum';
import { TransactionCategory } from './enums/transaction-category.enum';
import { classifySchwabTransactionType } from './transaction-classify.util';

export interface ClassifiedTransaction {
  schwabTransactionId: string | null;
  category: TransactionCategory;
  schwabType: string | null;
  netAmount: number;
  symbol: string | null;
  description: string | null;
  transactionDate: Date;
  orderId: string | null;
  raw: Record<string, unknown>;
  fills: ExtractedFill[];
}

export interface ExtractedFill {
  symbol: string;
  assetType: FillAssetType;
  instruction: FillInstruction;
  quantity: number;
  price: number;
  amount: number;
  positionEffect: PositionEffect | null;
  orderId: string | null;
  transactionDate: Date;
  schwabTransactionId: string | null;
}

function mapPositionEffect(raw: unknown): PositionEffect | null {
  const value = String(raw ?? '').toUpperCase();
  if (value === 'OPENING') return PositionEffect.OPENING;
  if (value === 'CLOSING') return PositionEffect.CLOSING;
  return null;
}

function mapAssetType(raw: unknown): FillAssetType {
  const value = String(raw ?? '').toUpperCase();
  return value === 'OPTION' ? FillAssetType.OPTION : FillAssetType.EQUITY;
}

function mapInstruction(
  rawInstruction: unknown,
  positionEffect: PositionEffect | null,
  quantitySigned: number,
): FillInstruction {
  const value = String(rawInstruction ?? '').toUpperCase();
  if (value.includes('SELL')) return FillInstruction.SELL;
  if (value.includes('BUY')) return FillInstruction.BUY;

  if (positionEffect === PositionEffect.OPENING) {
    return quantitySigned >= 0 ? FillInstruction.BUY : FillInstruction.SELL;
  }
  if (positionEffect === PositionEffect.CLOSING) {
    // Closing a long = SELL; closing a short = BUY. Quantity sign on the
    // security leg is typically negative when delivering shares (sell).
    return quantitySigned >= 0 ? FillInstruction.BUY : FillInstruction.SELL;
  }

  return quantitySigned >= 0 ? FillInstruction.BUY : FillInstruction.SELL;
}

/**
 * Flattens one Schwab transaction into a classified ledger row plus any
 * instrument fill legs suitable for FIFO matching.
 */
export function mapSchwabTransaction(raw: any): ClassifiedTransaction {
  const schwabType = raw?.type ?? null;
  const netAmount = Number(raw?.netAmount ?? 0);
  const category = classifySchwabTransactionType(schwabType, netAmount);
  const schwabTransactionId =
    raw?.transactionId != null ? String(raw.transactionId) : null;
  const orderId = raw?.orderId != null ? String(raw.orderId) : null;
  const transactionDate = new Date(
    raw?.transactionDate ?? raw?.orderDate ?? Date.now(),
  );

  const transferItems: any[] = Array.isArray(raw?.transferItems)
    ? raw.transferItems
    : [];

  const fills: ExtractedFill[] = [];
  let primarySymbol: string | null = null;

  for (const item of transferItems) {
    const instrument = item?.instrument;
    if (!instrument?.symbol) continue;
    // Fee/cash legs have no tradable instrument symbol of interest for FIFO.
    if (item?.feeType) continue;
    const assetType = mapAssetType(instrument.assetType);
    // Skip pure cash/currency legs that aren't EQUITY/OPTION.
    if (
      instrument.assetType &&
      !['EQUITY', 'OPTION', 'COLLECTIVE_INVESTMENT'].includes(
        String(instrument.assetType).toUpperCase(),
      )
    ) {
      continue;
    }

    const symbol = String(instrument.symbol);
    primarySymbol = primarySymbol ?? symbol;
    const amount = Number(item?.cost ?? item?.amount ?? 0);
    const explicitQty = Number(item?.amount ?? item?.quantity ?? 0);
    // For security legs Schwab often puts share/contract count in `amount`
    // and dollar cost in `cost`. Prefer a non-currency quantity.
    const qtySigned =
      Number.isFinite(explicitQty) && explicitQty !== 0 ? explicitQty : amount;
    const qty = Math.abs(qtySigned);
    if (!qty || !Number.isFinite(qty)) continue;

    const price = Number(item?.price ?? 0);
    const positionEffect = mapPositionEffect(item?.positionEffect);
    fills.push({
      symbol,
      assetType,
      instruction: mapInstruction(item?.instruction, positionEffect, qtySigned),
      quantity: qty,
      price: Number.isFinite(price) ? price : 0,
      amount,
      positionEffect,
      orderId,
      transactionDate,
      schwabTransactionId,
    });
  }

  // Prefer an instrument symbol from the first fill; otherwise leave null.
  return {
    schwabTransactionId,
    category,
    schwabType,
    netAmount,
    symbol: primarySymbol,
    description: raw?.description ?? null,
    transactionDate,
    orderId,
    raw: raw as Record<string, unknown>,
    fills: category === TransactionCategory.TRADE ? fills : [],
  };
}
