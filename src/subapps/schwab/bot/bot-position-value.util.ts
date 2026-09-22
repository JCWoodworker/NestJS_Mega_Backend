import {
  commissionForLeg,
  commissionForRoundTrip,
} from './bot-fees.const';

/**
 * Derived capital picture for an open bot position.
 *
 * Computed per status read, never persisted — `paperEquity` stays realized-only
 * so risk gates keep their current semantics. The desk needs this to reconcile
 * settled cash + cost basis + mark value into a coherent capital story while
 * a trade is open.
 */
export interface OpenPositionValue {
  /** entry × qty × 100 — dollars paid for the contracts. */
  costBasis: number;
  /** Entry-leg commission — already deducted from settledCash. */
  commissionPaid: number;
  /** Both legs — the basis for openPnlNet (matches recordTradeClose). */
  commissionRoundTrip: number;
  /** Settled + costBasis + commissionPaid — capital before the trade. */
  capitalBeforeTrade: number;
  /** Last streamed bid; null if never seen. */
  markBid: number | null;
  /** Epoch ms of that bid. Desk applies its own QUOTE_STALE_MS. */
  markAt: number | null;
  /** markBid × qty × 100. */
  markValue: number | null;
  openPnlGross: number | null;
  /** Gross − commissionRoundTrip. */
  openPnlNet: number | null;
  /** settledCash + markValue — equity marked to market. */
  equityMarkToMarket: number | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Pure capital reconciliation for an open long option position.
 *
 * A null mark yields nulls for the mark-dependent fields rather than zeros —
 * an unknown P&L must not render as break-even.
 */
export function computeOpenPositionValue(params: {
  entryPrice: number;
  quantity: number;
  settledCash: number;
  markBid: number | null;
  markAt: number | null;
}): OpenPositionValue {
  const qty = Math.max(0, params.quantity);
  const costBasis = round2(params.entryPrice * qty * 100);
  const commissionPaid = commissionForLeg(qty);
  const commissionRoundTrip = commissionForRoundTrip(qty);
  const capitalBeforeTrade = round2(
    params.settledCash + costBasis + commissionPaid,
  );

  if (
    params.markBid == null ||
    !Number.isFinite(params.markBid) ||
    params.markBid <= 0
  ) {
    return {
      costBasis,
      commissionPaid,
      commissionRoundTrip,
      capitalBeforeTrade,
      markBid: null,
      markAt: null,
      markValue: null,
      openPnlGross: null,
      openPnlNet: null,
      equityMarkToMarket: null,
    };
  }

  const markValue = round2(params.markBid * qty * 100);
  const openPnlGross = round2((params.markBid - params.entryPrice) * qty * 100);
  const openPnlNet = round2(openPnlGross - commissionRoundTrip);
  const equityMarkToMarket = round2(params.settledCash + markValue);

  return {
    costBasis,
    commissionPaid,
    commissionRoundTrip,
    capitalBeforeTrade,
    markBid: params.markBid,
    markAt: params.markAt,
    markValue,
    openPnlGross,
    openPnlNet,
    equityMarkToMarket,
  };
}
