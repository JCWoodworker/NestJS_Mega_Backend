import { FillInstruction } from './enums/fill-instruction.enum';
import { OrderSource } from './enums/order-source.enum';
import { TradeDirection } from './enums/trade-direction.enum';

export interface FifoFillInput {
  id: string;
  symbol: string;
  instruction: FillInstruction;
  quantity: number;
  price: number;
  transactionDate: Date;
  /** When present, OPENING/CLOSING hints override buy/sell direction inference. */
  positionEffect?: 'OPENING' | 'CLOSING' | null;
  /** Defaults to MANUAL_LIVE when omitted (legacy fills). */
  source?: OrderSource;
}

export interface RealizedTradeMatch {
  symbol: string;
  direction: TradeDirection;
  quantity: number;
  openPrice: number;
  closePrice: number;
  openedAt: Date;
  closedAt: Date;
  realizedPnl: number;
  openFillId: string;
  closeFillId: string;
  source: OrderSource;
}

interface OpenLot {
  fillId: string;
  remaining: number;
  price: number;
  openedAt: Date;
  direction: TradeDirection;
}

/**
 * Option contracts are quoted per-share; Schwab P&L multiplies by 100.
 * Equities and anything else use a multiplier of 1.
 */
function contractMultiplier(symbol: string): number {
  // OSI option symbols are longer and include C/P + strike digits.
  // A crude but reliable heuristic for this app's SPY 0DTE ladder:
  // option symbols contain an embedded date+C/P pattern (e.g. SPY   260903C00770000).
  if (/[0-9]{6}[CP][0-9]{8}/.test(symbol.replace(/\s+/g, ''))) {
    return 100;
  }
  return 1;
}

function signedQty(fill: FifoFillInput): number {
  const qty = Math.abs(Number(fill.quantity));
  if (fill.positionEffect === 'OPENING') {
    return fill.instruction === FillInstruction.SELL ? -qty : qty;
  }
  if (fill.positionEffect === 'CLOSING') {
    return fill.instruction === FillInstruction.BUY ? qty : -qty;
  }
  // Default: BUY opens/adds long, SELL opens/adds short (or closes opposite).
  return fill.instruction === FillInstruction.BUY ? qty : -qty;
}

/**
 * FIFO-matches fills per (symbol, source) into closed round-trips.
 * Handles longs, shorts, and partial fills. Open lots that never close are
 * left unmatched (unrealized) and omitted from the result.
 * BOT_LIVE / MANUAL_LIVE / BOT_PAPER fills on the same symbol never cross-match.
 */
export function matchFills(fills: FifoFillInput[]): RealizedTradeMatch[] {
  const byKey = new Map<string, FifoFillInput[]>();
  for (const fill of fills) {
    const source = fill.source ?? OrderSource.MANUAL_LIVE;
    const key = `${fill.symbol}::${source}`;
    const list = byKey.get(key) ?? [];
    list.push(fill);
    byKey.set(key, list);
  }

  const matches: RealizedTradeMatch[] = [];

  for (const [key, symbolFills] of byKey) {
    const [symbol, sourceRaw] = key.split('::');
    const source = (sourceRaw as OrderSource) || OrderSource.MANUAL_LIVE;
    const sorted = [...symbolFills].sort(
      (a, b) =>
        a.transactionDate.getTime() - b.transactionDate.getTime() ||
        a.id.localeCompare(b.id),
    );
    const openLots: OpenLot[] = [];
    const mult = contractMultiplier(symbol);

    for (const fill of sorted) {
      let remaining = signedQty(fill);

      // Absorb against opposite-direction open lots first (closing).
      while (remaining !== 0 && openLots.length > 0) {
        const lot = openLots[0];
        const sameDirection =
          (lot.direction === TradeDirection.LONG && remaining > 0) ||
          (lot.direction === TradeDirection.SHORT && remaining < 0);

        if (sameDirection) break;

        const closeQty = Math.min(Math.abs(remaining), lot.remaining);
        const direction = lot.direction;
        const realizedPnl =
          direction === TradeDirection.LONG
            ? (Number(fill.price) - lot.price) * closeQty * mult
            : (lot.price - Number(fill.price)) * closeQty * mult;

        matches.push({
          symbol,
          direction,
          quantity: closeQty,
          openPrice: lot.price,
          closePrice: Number(fill.price),
          openedAt: lot.openedAt,
          closedAt: fill.transactionDate,
          realizedPnl,
          openFillId: lot.fillId,
          closeFillId: fill.id,
          source,
        });

        lot.remaining -= closeQty;
        if (lot.remaining <= 1e-9) openLots.shift();

        remaining = remaining > 0 ? remaining - closeQty : remaining + closeQty;
      }

      if (Math.abs(remaining) > 1e-9) {
        openLots.push({
          fillId: fill.id,
          remaining: Math.abs(remaining),
          price: Number(fill.price),
          openedAt: fill.transactionDate,
          direction: remaining > 0 ? TradeDirection.LONG : TradeDirection.SHORT,
        });
      }
    }
  }

  return matches;
}

/** tradingPnl = endEquity - startEquity - netTransfers */
export function computeTradingPnl(
  startEquity: number,
  endEquity: number,
  netTransfers: number,
): number {
  return Number(endEquity) - Number(startEquity) - Number(netTransfers);
}
