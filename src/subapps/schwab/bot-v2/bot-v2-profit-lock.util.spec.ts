import {
  bidForReturnPct,
  disasterStopBid,
  lockedReturnFor,
  ratchetProfitLock,
  returnOnCostPct,
} from './bot-v2-profit-lock.util';

describe('trainer profit lock', () => {
  const entry = 7;
  const fee = 1.3;
  const at = (pct: number) => bidForReturnPct(pct, entry, 1, fee);

  it('return on cost nets the commission', () => {
    expect(returnOnCostPct(entry, entry, 1, fee)).toBeCloseTo(-0.186, 2);
    expect(returnOnCostPct(at(10), entry, 1, fee)).toBeCloseTo(10, 6);
  });

  it('ladder: nothing below +8, +2 at +8, peak−6 to +20, peak−4 above', () => {
    expect(lockedReturnFor(7.9)).toBeNull();
    expect(lockedReturnFor(8)).toBe(2);
    expect(lockedReturnFor(10)).toBe(4);
    expect(lockedReturnFor(14)).toBe(8);
    expect(lockedReturnFor(20)).toBe(16);
    expect(lockedReturnFor(25)).toBe(21);
    expect(lockedReturnFor(40)).toBe(36);
  });

  it('opening spread of −4.8% does not stop out', () => {
    const r = ratchetProfitLock({
      entryPremium: entry,
      optionBid: at(-4.8),
      peakBid: null,
      stopPremium: null,
      quantity: 1,
      commissionRoundTrip: fee,
    });
    expect(r.trailArmed).toBe(false);
    expect(r.source).toBe('INITIAL');
    expect(r.stopPremium).toBe(disasterStopBid(entry, 1, fee));
    expect(at(-4.8)).toBeGreaterThan(r.stopPremium as number);
  });

  it('a +7% peak then a pullback to −11% still holds the −12% floor', () => {
    const r = ratchetProfitLock({
      entryPremium: entry,
      optionBid: at(-11),
      peakBid: at(7),
      stopPremium: disasterStopBid(entry, 1, fee),
      quantity: 1,
      commissionRoundTrip: fee,
    });
    expect(r.trailArmed).toBe(false);
    expect(at(-11)).toBeGreaterThan(r.stopPremium as number);
  });

  it('+8% peak locks +2%, +14% locks +8%, +25% locks +21%', () => {
    const base = {
      entryPremium: entry,
      stopPremium: disasterStopBid(entry, 1, fee),
      quantity: 1,
      commissionRoundTrip: fee,
    };
    const r8 = ratchetProfitLock({ ...base, optionBid: at(8), peakBid: at(8) });
    expect(r8.trailArmed).toBe(true);
    expect(r8.source).toBe('TRAIL');
    expect(returnOnCostPct(r8.stopPremium as number, entry, 1, fee)).toBeCloseTo(2, 1);

    const r14 = ratchetProfitLock({ ...base, optionBid: at(14), peakBid: at(14), stopPremium: r8.stopPremium });
    expect(returnOnCostPct(r14.stopPremium as number, entry, 1, fee)).toBeCloseTo(8, 1);

    const r25 = ratchetProfitLock({ ...base, optionBid: at(25), peakBid: at(25), stopPremium: r14.stopPremium });
    expect(returnOnCostPct(r25.stopPremium as number, entry, 1, fee)).toBeCloseTo(21, 1);
  });

  it('never lowers the stop', () => {
    const high = ratchetProfitLock({
      entryPremium: entry,
      optionBid: at(14),
      peakBid: at(14),
      stopPremium: null,
      quantity: 1,
      commissionRoundTrip: fee,
    });
    const later = ratchetProfitLock({
      entryPremium: entry,
      optionBid: at(9),
      peakBid: at(14),
      stopPremium: high.stopPremium,
      quantity: 1,
      commissionRoundTrip: fee,
    });
    expect(later.stopPremium).toBe(high.stopPremium);
    expect(later.raised).toBe(false);
  });

  it('raises an inherited −25% stop up to the floor on the first tick', () => {
    const r = ratchetProfitLock({
      entryPremium: entry,
      optionBid: 7.05,
      peakBid: 7.05,
      stopPremium: 5.25,
      quantity: 1,
      commissionRoundTrip: fee,
    });
    expect(r.stopPremium).toBe(disasterStopBid(entry, 1, fee));
    expect(r.raised).toBe(true);
  });
});
