import { sizeAtRisk } from './bot-v2-sizing.util';

describe('sizeAtRisk', () => {
  const base = {
    useRiskAtStop: false,
    maxRiskUsd: 200,
    ask: 1,
    stopPremium: 0.75,
    settledCash: 10_000,
    equity: 10_000,
    riskPct: 10,
  };

  it('uses premium notional when the flag is off, capped at one contract', () => {
    const result = sizeAtRisk(base);
    expect(result).toEqual({ qty: 1, reason: 'OK' });
  });

  it('does not buy four contracts when the dollar cap would allow it', () => {
    const result = sizeAtRisk({
      ...base,
      useRiskAtStop: true,
      maxRiskUsd: 800,
      ask: 7,
      stopPremium: 5.25,
      settledCash: 10_000,
    });
    expect(result).toEqual({ qty: 1, reason: 'OK' });
  });

  it('sizes to the stop and still respects cash', () => {
    const result = sizeAtRisk({
      ...base,
      useRiskAtStop: true,
      maxRiskUsd: 200,
      ask: 1,
      stopPremium: 0.75,
      settledCash: 150,
    });
    // Risk allows 8 (200 / 25). Cash allows 1 (150 / 100).
    expect(result).toEqual({ qty: 1, reason: 'OK' });
  });

  it('refuses a stop closer than one tick', () => {
    const result = sizeAtRisk({
      ...base,
      useRiskAtStop: true,
      ask: 1,
      stopPremium: 0.995,
    });
    expect(result).toEqual({ qty: 0, reason: 'STOP_TOO_TIGHT' });
  });

  it('refuses risk sizing when no premium stop exists', () => {
    const result = sizeAtRisk({
      ...base,
      useRiskAtStop: true,
      stopPremium: null,
    });
    expect(result.reason).toBe('NO_STOP');
  });
});
