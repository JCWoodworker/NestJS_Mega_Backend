import { mapOptionTick, mapOptionTicks } from './option-tick.mapper';

describe('option-tick.mapper', () => {
  describe('mapOptionTick', () => {
    it('maps real Schwab field numbers (bid=2, ask=3, last=4, volume=8) to named fields', () => {
      const raw = {
        key: 'SPY   260903P00768000',
        '2': 1.13,
        '3': 1.14,
        '4': 1.14,
        '8': 132775,
        '16': 227,
        '17': 224,
      };

      expect(mapOptionTick(raw)).toEqual({
        symbol: 'SPY   260903P00768000',
        bid: 1.13,
        ask: 1.14,
        last: 1.14,
        volume: 132775,
        bidSize: 227,
        askSize: 224,
      });
    });

    it('does not read field "1" as bid (that field is Description, a string, on LEVELONE_OPTIONS)', () => {
      const raw = {
        key: 'SPY   260903C00768000',
        '1': 'SPDR S&P 500 Sep 03 2026 768 Call',
        '2': 1.2,
      };

      const tick = mapOptionTick(raw);
      expect(tick.bid).toBe(1.2);
      expect((tick as any)['1']).toBeUndefined();
    });

    it('omits fields absent from a partial "Change" delta update instead of defaulting to 0', () => {
      const raw = { key: 'SPY   260903P00768000', '8': 132804, '16': 167 };

      const tick = mapOptionTick(raw);
      expect(tick).toEqual({
        symbol: 'SPY   260903P00768000',
        volume: 132804,
        bidSize: 167,
      });
      expect(tick.bid).toBeUndefined();
      expect(tick.ask).toBeUndefined();
      expect(tick.last).toBeUndefined();
    });

    it('falls back to field "0" when "key" is absent', () => {
      const raw = { '0': 'SPY   260903C00768000', '2': 1.1, '3': 1.2 };
      expect(mapOptionTick(raw)?.symbol).toBe('SPY   260903C00768000');
    });

    it('returns null when no symbol can be determined', () => {
      expect(mapOptionTick({ '2': 1.1 })).toBeNull();
    });
  });

  describe('mapOptionTicks', () => {
    it('maps a batch and drops entries without a symbol', () => {
      const result = mapOptionTicks([
        { key: 'A', '2': 1 },
        { '2': 2 },
        { key: 'B', '3': 3 },
      ]);

      expect(result).toEqual([
        { symbol: 'A', bid: 1 },
        { symbol: 'B', ask: 3 },
      ]);
    });
  });
});
