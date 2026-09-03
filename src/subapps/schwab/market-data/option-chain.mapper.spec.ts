import { mapOptionChainResponse } from './option-chain.mapper';

describe('mapOptionChainResponse', () => {
  it('flattens callExpDateMap and putExpDateMap into one array, mapping totalVolume to volume', () => {
    const response = {
      callExpDateMap: {
        '2026-09-03:0': {
          '772.0': [
            {
              symbol: 'SPY   260903C00772000',
              bid: 1.1,
              ask: 1.15,
              last: 1.12,
              bidSize: 10,
              askSize: 12,
              totalVolume: 500,
              delta: 0.51,
            },
          ],
        },
      },
      putExpDateMap: {
        '2026-09-03:0': {
          '772.0': [
            {
              symbol: 'SPY   260903P00772000',
              bid: 0.9,
              ask: 0.95,
              last: 0.92,
              bidSize: 8,
              askSize: 9,
              totalVolume: 300,
              delta: -0.49,
            },
          ],
        },
      },
    };

    const quotes = mapOptionChainResponse(response);

    expect(quotes).toEqual([
      {
        symbol: 'SPY   260903C00772000',
        bid: 1.1,
        ask: 1.15,
        last: 1.12,
        bidSize: 10,
        askSize: 12,
        volume: 500,
        delta: 0.51,
      },
      {
        symbol: 'SPY   260903P00772000',
        bid: 0.9,
        ask: 0.95,
        last: 0.92,
        bidSize: 8,
        askSize: 9,
        volume: 300,
        delta: -0.49,
      },
    ]);
  });

  it('nulls out missing/non-numeric fields instead of defaulting to 0', () => {
    const response = {
      callExpDateMap: {
        '2026-09-03:0': {
          '772.0': [
            { symbol: 'SPY   260903C00772000', bid: null, ask: undefined },
          ],
        },
      },
    };

    expect(mapOptionChainResponse(response)).toEqual([
      {
        symbol: 'SPY   260903C00772000',
        bid: null,
        ask: null,
        last: null,
        bidSize: null,
        askSize: null,
        volume: null,
        delta: null,
      },
    ]);
  });

  it('drops contracts without a symbol', () => {
    const response = {
      callExpDateMap: { '2026-09-03:0': { '772.0': [{ bid: 1 }] } },
    };
    expect(mapOptionChainResponse(response)).toEqual([]);
  });

  it('returns an empty array for a malformed/empty response', () => {
    expect(mapOptionChainResponse({})).toEqual([]);
    expect(mapOptionChainResponse(null)).toEqual([]);
  });
});
