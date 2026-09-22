import { OPTION_COMMISSION_PER_CONTRACT } from './bot-fees.const';
import { computeOpenPositionValue } from './bot-position-value.util';

describe('computeOpenPositionValue', () => {
  // The 2026-09-21 live trade: SPY 769 CALL ×7 @ 0.92, bid 1.16.
  const base = {
    entryPrice: 0.92,
    quantity: 7,
    settledCash: 5869.1, // after paying cost + entry commission from ~6446
    markBid: 1.16 as number | null,
    markAt: 1_700_000_000_000 as number | null,
  };

  it('reconciles settled + cost + entry commission to capital before trade', () => {
    const v = computeOpenPositionValue(base);
    expect(v.costBasis).toBe(644); // 0.92 × 7 × 100
    expect(v.commissionPaid).toBeCloseTo(7 * OPTION_COMMISSION_PER_CONTRACT, 2);
    expect(v.capitalBeforeTrade).toBeCloseTo(
      base.settledCash + v.costBasis + v.commissionPaid,
      2,
    );
  });

  it('marks equity to market and nets open P&L against round-trip fees', () => {
    const v = computeOpenPositionValue(base);
    expect(v.markValue).toBe(812); // 1.16 × 7 × 100
    expect(v.openPnlGross).toBe(168); // (1.16 − 0.92) × 7 × 100
    expect(v.openPnlNet).toBeCloseTo(
      168 - 14 * OPTION_COMMISSION_PER_CONTRACT,
      2,
    );
    expect(v.equityMarkToMarket).toBeCloseTo(base.settledCash + 812, 2);
  });

  it('returns nulls for mark-dependent fields when the bid is missing', () => {
    const v = computeOpenPositionValue({
      ...base,
      markBid: null,
      markAt: null,
    });
    expect(v.costBasis).toBe(644);
    expect(v.markValue).toBeNull();
    expect(v.openPnlGross).toBeNull();
    expect(v.openPnlNet).toBeNull();
    expect(v.equityMarkToMarket).toBeNull();
  });

  it('treats a non-positive mark as unknown, not break-even', () => {
    const v = computeOpenPositionValue({ ...base, markBid: 0 });
    expect(v.openPnlNet).toBeNull();
  });

  it('scales commission with quantity', () => {
    const one = computeOpenPositionValue({ ...base, quantity: 1 });
    const ten = computeOpenPositionValue({ ...base, quantity: 10 });
    expect(ten.commissionRoundTrip).toBeCloseTo(one.commissionRoundTrip * 10, 2);
  });
});
