import { OptionChainQuote } from '@schwab/market-data/option-chain.mapper';

import {
  computeBudget,
  selectContract,
  selectContractDetailed,
  sizePosition,
} from './bot-strike-selection.util';

function quote(partial: Partial<OptionChainQuote>): OptionChainQuote {
  return {
    symbol: 'SPY   260903C00770000',
    bid: 1,
    ask: 1.1,
    last: 1.05,
    bidSize: 10,
    askSize: 10,
    volume: 100,
    delta: 0.5,
    ...partial,
  };
}

describe('computeBudget', () => {
  it('is the lesser of settledCash and equity*riskPct', () => {
    expect(computeBudget(500, 10000, 10)).toBe(500);
    expect(computeBudget(2000, 10000, 10)).toBe(1000);
  });
});

describe('sizePosition', () => {
  it('floors to whole contracts fitting the budget', () => {
    expect(sizePosition(250, 1.1)).toBe(2); // 250 / 110 = 2.27
  });

  it('returns 0 (SKIP_BUDGET) when budget cannot afford one contract', () => {
    expect(sizePosition(50, 1.1)).toBe(0);
  });

  it('returns 0 for non-positive premium or budget', () => {
    expect(sizePosition(500, 0)).toBe(0);
    expect(sizePosition(0, 1)).toBe(0);
  });
});

describe('selectContract', () => {
  const filters = {
    deltaMin: 0.4,
    deltaMax: 0.6,
    minPremium: 0.6,
    maxPremium: 2.5,
    maxSpreadPct: 5,
  };

  it('picks a call within delta/premium/spread bounds', () => {
    const chain = [
      quote({ symbol: 'SPY   260903C00770000', delta: 0.5, bid: 1, ask: 1.02 }),
    ];
    const result = selectContract(chain, 'CALL', filters);
    expect(result?.symbol).toBe('SPY   260903C00770000');
  });

  it('filters out contracts with delta outside the band', () => {
    const chain = [
      quote({ symbol: 'SPY   260903C00770000', delta: 0.9, bid: 1, ask: 1.02 }),
    ];
    expect(selectContract(chain, 'CALL', filters)).toBeNull();
  });

  it('filters out contracts with premium outside min/max', () => {
    const chain = [
      quote({ symbol: 'SPY   260903C00770000', delta: 0.5, bid: 3, ask: 3.05 }),
    ];
    expect(selectContract(chain, 'CALL', filters)).toBeNull();
  });

  it('filters out contracts with too-wide a spread', () => {
    const chain = [
      quote({ symbol: 'SPY   260903C00770000', delta: 0.5, bid: 1, ask: 1.5 }),
    ];
    expect(selectContract(chain, 'CALL', filters)).toBeNull();
  });

  it('only considers puts for PUT direction', () => {
    const chain = [
      quote({ symbol: 'SPY   260903C00770000', delta: 0.5, bid: 1, ask: 1.02 }),
      quote({
        symbol: 'SPY   260903P00770000',
        delta: -0.5,
        bid: 1,
        ask: 1.02,
      }),
    ];
    const result = selectContract(chain, 'PUT', filters);
    expect(result?.symbol).toBe('SPY   260903P00770000');
  });

  it('prefers the smaller |delta| (more OTM) among candidates', () => {
    const chain = [
      quote({
        symbol: 'SPY   260903C00770000',
        delta: 0.58,
        bid: 1,
        ask: 1.02,
      }),
      quote({
        symbol: 'SPY   260903C00771000',
        delta: 0.42,
        bid: 1,
        ask: 1.02,
      }),
    ];
    const result = selectContract(chain, 'CALL', filters);
    expect(result?.symbol).toBe('SPY   260903C00771000');
  });

  it('returns null when no candidates match', () => {
    expect(selectContract([], 'CALL', filters)).toBeNull();
  });
});

describe('selectContractDetailed diagnostics (NO_CONTRACT_MATCH detail)', () => {
  const filters = {
    deltaMin: 0.4,
    deltaMax: 0.6,
    minPremium: 0.6,
    maxPremium: 2.5,
    maxSpreadPct: 5,
  };

  it('counts each filter that rejected a right-side quote', () => {
    const chain = [
      quote({ symbol: 'SPY   260903C00770000', delta: 0.9, bid: 1, ask: 1.02 }),
      quote({ symbol: 'SPY   260903C00771000', delta: 0.5, bid: 3, ask: 3.05 }),
      quote({ symbol: 'SPY   260903C00772000', delta: 0.5, bid: 1, ask: 1.5 }),
      quote({
        symbol: 'SPY   260903P00770000',
        delta: -0.5,
        bid: 1,
        ask: 1.02,
      }),
    ];
    const { contract, diagnostics } = selectContractDetailed(
      chain,
      'CALL',
      filters,
    );
    expect(contract).toBeNull();
    expect(diagnostics.chainSize).toBe(4);
    expect(diagnostics.rightMatches).toBe(3);
    expect(diagnostics.rejects).toMatchObject({
      delta: 1,
      premium: 1,
      spread: 1,
    });
  });

  it('reports the nearest miss so the operator can see how far off the band is', () => {
    const chain = [
      quote({ symbol: 'SPY   260903C00770000', delta: 0.95, bid: 1, ask: 1.02 }),
      quote({ symbol: 'SPY   260903C00771000', delta: 0.62, bid: 1, ask: 1.02 }),
    ];
    const { diagnostics } = selectContractDetailed(chain, 'CALL', filters);
    expect(diagnostics.best?.symbol).toBe('SPY   260903C00771000');
    expect(diagnostics.best?.delta).toBe(0.62);
  });

  it('counts unquotable contracts separately from band misses', () => {
    const chain = [
      quote({ symbol: 'SPY   260903C00770000', delta: null, bid: 1, ask: 1.02 }),
    ];
    const { diagnostics } = selectContractDetailed(chain, 'CALL', filters);
    expect(diagnostics.rejects.noQuote).toBe(1);
    expect(diagnostics.rejects.delta).toBe(0);
  });

  it('has no best and no rejects when a candidate matches', () => {
    const chain = [
      quote({ symbol: 'SPY   260903C00770000', delta: 0.5, bid: 1, ask: 1.02 }),
    ];
    const { contract, diagnostics } = selectContractDetailed(
      chain,
      'CALL',
      filters,
    );
    expect(contract?.symbol).toBe('SPY   260903C00770000');
    expect(diagnostics.best).toBeNull();
    expect(diagnostics.rejects).toEqual({
      delta: 0,
      premium: 0,
      spread: 0,
      noQuote: 0,
    });
  });
});
