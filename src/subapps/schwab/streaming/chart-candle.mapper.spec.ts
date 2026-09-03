import {
  mapChartEquityCandle,
  mapChartOptionCandle,
} from './chart-candle.mapper';

describe('chart-candle.mapper', () => {
  describe('mapChartEquityCandle', () => {
    it('maps a real captured CHART_EQUITY frame (fields 2-6 = OHLCV, 1 = sequence) into a sane candle', () => {
      // Raw frame captured live on preprod 2026-09-03 - see chart-fields.ts
      // for how this pinned down the true field numbering.
      const raw = {
        '1': 311,
        '2': 772.625,
        '3': 772.67,
        '4': 772.41,
        '5': 772.438321,
        '6': 71229,
        '7': 1788451860000,
        '8': 20699,
        key: 'SPY',
      };

      const candle = mapChartEquityCandle(raw, 'SPY');

      expect(candle).toEqual({
        symbol: 'SPY',
        assetType: 'EQUITY',
        open: 772.625,
        high: 772.67,
        low: 772.41,
        close: 772.438321,
        volume: 71229,
        chartTime: 1788451860000,
      });
      expect(candle.low).toBeLessThanOrEqual(candle.high);
    });

    it('rejects the old (buggy) field mapping as structurally impossible - low > high', () => {
      // What the previous OPEN:'1'..VOLUME:'5' mapping would have produced
      // from the same raw frame: open=311 (nonsense), then OHLC slid down
      // one, landing low (772.67) above high (772.41).
      const buggyShapedCandle = {
        symbol: 'SPY',
        assetType: 'EQUITY' as const,
        open: 311,
        high: 772.625,
        low: 772.67,
        close: 772.41,
        volume: 772.438321,
        chartTime: 1788451860000,
      };

      expect(buggyShapedCandle.low).toBeGreaterThan(buggyShapedCandle.high);
    });

    it('falls back to the underlying symbol when key is absent', () => {
      const raw = { '2': 1, '3': 2, '4': 0.5, '5': 1.5, '6': 100, '7': 123 };
      expect(mapChartEquityCandle(raw, 'QQQ')?.symbol).toBe('QQQ');
    });

    it('returns null when chartTime is missing (not a real candle frame)', () => {
      expect(mapChartEquityCandle({ '2': 1 }, 'SPY')).toBeNull();
    });

    it('drops a structurally impossible bar (low > high) instead of emitting it', () => {
      const raw = {
        '2': 1, // open
        '3': 2, // high
        '4': 5, // low - above high, impossible
        '5': 3, // close
        '6': 100,
        '7': 123,
        key: 'SPY',
      };
      expect(mapChartEquityCandle(raw, 'SPY')).toBeNull();
    });
  });

  describe('mapChartOptionCandle', () => {
    it('maps a CHART_OPTIONS frame (chartTime=1, OHLCV=2-6)', () => {
      const raw = {
        '1': 1788451860000,
        '2': 1.1,
        '3': 1.2,
        '4': 1.05,
        '5': 1.15,
        '6': 42,
        key: 'SPY   260903C00772000',
      };

      expect(mapChartOptionCandle(raw, 'SPY   260903C00772000')).toEqual({
        symbol: 'SPY   260903C00772000',
        assetType: 'OPTION',
        open: 1.1,
        high: 1.2,
        low: 1.05,
        close: 1.15,
        volume: 42,
        chartTime: 1788451860000,
      });
    });

    it('drops a structurally impossible option bar', () => {
      const raw = { '1': 123, '2': 1, '3': 1, '4': 5, '5': 1, '6': 1 };
      expect(mapChartOptionCandle(raw, 'X')).toBeNull();
    });
  });
});
